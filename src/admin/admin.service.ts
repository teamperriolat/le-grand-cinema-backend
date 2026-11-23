import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMovieDto,
  CreateScreeningDto,
  UpdateMovieDto,
  UpdateScreeningDto,
} from './admin.controller';
import { PaymentStatus, ReservationStatus, TicketStatus } from '@prisma/client';
import { CreateRoomDto, UpdateRoomDto } from './admin.controller';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  createMovie(dto: CreateMovieDto) {
    return this.prisma.movie.create({ data: dto });
  }

  async updateMovie(id: string, dto: UpdateMovieDto) {
    if (!(await this.prisma.movie.findUnique({ where: { id } }))) {
      throw new NotFoundException('Film introuvable');
    }
    return this.prisma.movie.update({ where: { id }, data: dto });
  }

  async deleteMovie(id: string) {
    if (!(await this.prisma.movie.findUnique({ where: { id } }))) {
      throw new NotFoundException('Film introuvable');
    }
    const reservationCount = await this.prisma.reservation.count({
      where: { screening: { movieId: id } },
    });
    if (reservationCount > 0) {
      throw new ConflictException('Impossible de supprimer un film avec des réservations');
    }
    return this.prisma.movie.delete({ where: { id } });
  }

  listRooms() {
    return this.prisma.room.findMany({ orderBy: { name: 'asc' } });
  }

  createRoom(dto: CreateRoomDto) {
    return this.prisma.room.create({ data: dto });
  }

  async updateRoom(id: string, dto: UpdateRoomDto) {
    if (!(await this.prisma.room.findUnique({ where: { id } }))) {
      throw new NotFoundException('Salle introuvable');
    }
    return this.prisma.room.update({ where: { id }, data: dto });
  }

  async deleteRoom(id: string) {
    if (!(await this.prisma.room.findUnique({ where: { id } }))) {
      throw new NotFoundException('Salle introuvable');
    }
    if (await this.prisma.screening.count({ where: { roomId: id } })) {
      throw new ConflictException('Impossible de supprimer une salle utilisée par une séance');
    }
    return this.prisma.room.delete({ where: { id } });
  }

  async createScreening(dto: CreateScreeningDto) {
    if (!(await this.prisma.movie.findUnique({ where: { id: dto.movieId } }))) {
      throw new NotFoundException('Film introuvable');
    }
    const room = await this.prisma.room.upsert({
      where: { name: dto.room },
      update: { capacity: dto.seatCount },
      create: { name: dto.room, capacity: dto.seatCount },
    });
    return this.prisma.screening.create({
      data: {
        movieId: dto.movieId,
        startsAt: new Date(dto.startsAt),
        roomId: room.id,
        priceCents: dto.priceCents,
        expectedRatio: dto.expectedRatio ?? 0.6,
        seats: {
          create: Array.from({ length: dto.seatCount }, (_, index) => ({
            label: `${String.fromCharCode(65 + Math.floor(index / 10))}${(index % 10) + 1}`,
          })),
        },
      },
      include: { movie: true, room: true, seats: true },
    });
  }

  async updateScreening(id: string, dto: UpdateScreeningDto) {
    const screening = await this.prisma.screening.findUnique({
      where: { id },
      include: { _count: { select: { seats: true } } },
    });
    if (!screening) {
      throw new NotFoundException('Séance introuvable');
    }
    if (dto.movieId && !(await this.prisma.movie.findUnique({ where: { id: dto.movieId } }))) {
      throw new NotFoundException('Film introuvable');
    }
    const { startsAt, room, ...data } = dto;
    const roomRecord = room
      ? await this.prisma.room.upsert({
          where: { name: room },
          update: {},
          create: { name: room, capacity: Math.max(screening._count.seats, 1) },
        })
      : undefined;
    return this.prisma.screening.update({
      where: { id },
      data: {
        ...data,
        ...(roomRecord ? { roomId: roomRecord.id } : {}),
        ...(startsAt ? { startsAt: new Date(startsAt) } : {}),
      },
      include: { movie: true, room: true, seats: true },
    });
  }

  async deleteScreening(id: string) {
    if (!(await this.prisma.screening.findUnique({ where: { id } }))) {
      throw new NotFoundException('Séance introuvable');
    }
    const reservationCount = await this.prisma.reservation.count({ where: { screeningId: id } });
    if (reservationCount > 0) {
      throw new ConflictException('Impossible de supprimer une séance avec des réservations');
    }
    return this.prisma.screening.delete({ where: { id } });
  }

  listReservations() {
    return this.prisma.reservation.findMany({
      include: {
        user: { select: { email: true } },
        screening: { include: { movie: true, room: true } },
        seats: { include: { seat: true } },
        ticket: true,
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateReservation(id: string, status: ReservationStatus) {
    if (!(await this.prisma.reservation.findUnique({ where: { id } }))) {
      throw new NotFoundException('Réservation introuvable');
    }
    return this.prisma.$transaction(async (tx) => {
      if (status === ReservationStatus.CANCELLED) {
        await tx.reservationSeat.deleteMany({ where: { reservationId: id } });
        await tx.ticket.update({
          where: { reservationId: id },
          data: { status: TicketStatus.CANCELLED },
        });
        await tx.payment.updateMany({
          where: { reservationId: id, status: PaymentStatus.PAID },
          data: { status: PaymentStatus.REFUNDED },
        });
      }
      if (status === ReservationStatus.USED) {
        await tx.ticket.update({
          where: { reservationId: id },
          data: { status: TicketStatus.USED, validatedAt: new Date() },
        });
      }
      return tx.reservation.update({ where: { id }, data: { status } });
    });
  }

  async analytics() {
    const screenings = await this.prisma.screening.findMany({
      include: {
        movie: { select: { title: true } },
        room: { select: { name: true } },
        seats: { include: { reservationSeats: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
    return screenings.map((screening) => {
      const capacity = screening.seats.length;
      const occupied = screening.seats.filter((seat) => seat.reservationSeats.length > 0).length;
      return {
        screeningId: screening.id,
        movieTitle: screening.movie.title,
        startsAt: screening.startsAt,
        capacity,
        occupied,
        occupancyRate: capacity ? Math.round((occupied / capacity) * 10000) / 100 : 0,
        forecastAttendance: Math.round(capacity * screening.expectedRatio),
      };
    });
  }
}
