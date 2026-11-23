import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaymentStatus, ReservationStatus, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReservationDto } from './reservations.controller';
@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}
  async create(userId: string, dto: CreateReservationDto) {
    if (new Set(dto.seatIds).size !== dto.seatIds.length)
      throw new BadRequestException('Siège dupliqué');
    try {
      return await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const screening = await tx.screening.findUnique({ where: { id: dto.screeningId } });
          if (!screening) throw new NotFoundException('Séance introuvable');
          const seats = await tx.seat.findMany({
            where: { id: { in: dto.seatIds }, screeningId: dto.screeningId },
          });
          if (seats.length !== dto.seatIds.length)
            throw new BadRequestException('Sélection invalide');
          if (await tx.reservationSeat.count({ where: { seatId: { in: dto.seatIds } } }))
            throw new ConflictException('Siège déjà réservé');
          const reservation = await tx.reservation.create({
            data: {
              userId,
              screeningId: dto.screeningId,
              totalCents: screening.priceCents * dto.seatIds.length,
              seats: { create: dto.seatIds.map((seatId) => ({ seatId })) },
              ticket: { create: {} },
              payment: {
                create: {
                  amountCents: screening.priceCents * dto.seatIds.length,
                },
              },
            },
            include: {
              seats: { include: { seat: true } },
              screening: { include: { movie: true, room: true } },
              ticket: true,
              payment: true,
            },
          });
          return this.present(reservation);
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error.code === 'P2002' || error.code === 'P2034')
      )
        throw new ConflictException('Siège déjà réservé');
      throw error;
    }
  }
  listMine(userId: string) {
    return this.prisma.reservation.findMany({
      where: { userId },
      include: {
        seats: { include: { seat: true } },
        screening: { include: { movie: true, room: true } },
        ticket: true,
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  async ticket(userId: string, id: string) {
    const item = await this.prisma.reservation.findFirst({
      where: { id, userId },
      include: {
        seats: { include: { seat: true } },
        screening: { include: { movie: true, room: true } },
        ticket: true,
        payment: true,
      },
    });
    if (!item) throw new NotFoundException('Réservation introuvable');
    return this.present(item);
  }

  async pay(userId: string, id: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id, userId },
      include: { payment: true },
    });
    if (!reservation) throw new NotFoundException('Réservation introuvable');
    if (reservation.status === ReservationStatus.CANCELLED) {
      throw new ConflictException('Une réservation annulée ne peut pas être payée');
    }
    if (reservation.payment?.status === PaymentStatus.PAID) return reservation.payment;
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const payment = await tx.payment.update({
        where: { reservationId: id },
        data: { status: PaymentStatus.PAID, paidAt: new Date() },
      });
      await tx.ticket.update({
        where: { reservationId: id },
        data: { status: TicketStatus.ACTIVE },
      });
      return payment;
    });
  }

  private present(item: any) {
    const { ticket, payment, screening, ...reservation } = item;
    return {
      ...reservation,
      ticketCode: ticket?.code,
      ticketStatus: ticket?.status,
      paymentStatus: payment?.status,
      screening: screening
        ? { ...screening, room: screening.room?.name ?? screening.room }
        : screening,
    };
  }
}
