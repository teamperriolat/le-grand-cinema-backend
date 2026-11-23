import { ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReservationsService } from '../src/reservations/reservations.service';

describe('Réservation concurrente PostgreSQL', () => {
  const prisma = new PrismaService();
  const service = new ReservationsService(prisma);
  let userA: string;
  let userB: string;
  let screeningId: string;
  let seatId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = `${Date.now()}-${Math.random()}`;
    const users = await Promise.all([
      prisma.user.create({
        data: { email: `a-${suffix}@test.local`, passwordHash: 'test', role: Role.USER },
      }),
      prisma.user.create({
        data: { email: `b-${suffix}@test.local`, passwordHash: 'test', role: Role.USER },
      }),
    ]);
    userA = users[0].id;
    userB = users[1].id;
    const movie = await prisma.movie.create({
      data: { title: `Film ${suffix}`, description: 'Test', durationMin: 90 },
    });
    const screening = await prisma.screening.create({
      data: {
        movieId: movie.id,
        startsAt: new Date(Date.now() + 86400000),
        room: { create: { name: `Salle ${suffix}`, capacity: 1 } },
        priceCents: 1000,
        seats: { create: [{ label: 'A1' }] },
      },
      include: { seats: true },
    });
    screeningId = screening.id;
    seatId = screening.seats[0].id;
  });

  afterAll(async () => {
    await prisma.reservationSeat.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.seat.deleteMany();
    await prisma.screening.deleteMany();
    await prisma.room.deleteMany();
    await prisma.movie.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  it('accepte une seule des deux réservations simultanées', async () => {
    const results = await Promise.allSettled([
      service.create(userA, { screeningId, seatIds: [seatId] }),
      service.create(userB, { screeningId, seatIds: [seatId] }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.reservation.count()).toBe(1);
  });
});
