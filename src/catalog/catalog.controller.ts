import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('movies') movies() {
    return this.prisma.movie
      .findMany({
        include: {
          screenings: {
            where: { startsAt: { gte: new Date() } },
            orderBy: { startsAt: 'asc' },
            include: { room: true },
          },
        },
      })
      .then((movies) =>
        movies.map((movie) => ({
          ...movie,
          screenings: movie.screenings.map(({ room, ...screening }) => ({
            ...screening,
            room: room.name,
          })),
        })),
      );
  }
  @Get('screenings/:id/seats') async seats(@Param('id') id: string) {
    const result = await this.prisma.screening.findUnique({
      where: { id },
      include: {
        movie: true,
        room: true,
        seats: { include: { reservationSeats: true }, orderBy: { label: 'asc' } },
      },
    });
    if (!result) throw new NotFoundException('Séance introuvable');
    return {
      ...result,
      room: result.room.name,
      seats: result.seats.map(({ reservationSeats, ...seat }) => ({
        ...seat,
        available: !reservationSeats.length,
      })),
    };
  }
}
