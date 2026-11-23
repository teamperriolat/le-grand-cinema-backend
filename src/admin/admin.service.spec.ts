import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  const tx = {
    reservationSeat: { deleteMany: jest.fn() },
    reservation: { update: jest.fn() },
    ticket: { update: jest.fn() },
    payment: { updateMany: jest.fn() },
  };
  const prisma = {
    movie: {
      create: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    screening: {
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    room: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    reservation: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const service = new AdminService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.room.upsert.mockResolvedValue({ id: 'room-1', name: 'Salle 1', capacity: 12 });
  });

  it('administre les salles et protège celles qui sont utilisées', async () => {
    prisma.room.findMany.mockResolvedValue([{ id: 'room-1', name: 'Salle 1', capacity: 30 }]);
    prisma.room.create.mockResolvedValue({ id: 'room-2', name: 'Salle 2', capacity: 20 });
    prisma.room.findUnique.mockResolvedValue({ id: 'room-1' });
    prisma.room.update.mockResolvedValue({ id: 'room-1', capacity: 40 });
    prisma.screening.count.mockResolvedValue(1);

    await expect(service.listRooms()).resolves.toHaveLength(1);
    await expect(service.createRoom({ name: 'Salle 2', capacity: 20 })).resolves.toEqual(
      expect.objectContaining({ id: 'room-2' }),
    );
    await expect(service.updateRoom('room-1', { capacity: 40 })).resolves.toEqual(
      expect.objectContaining({ capacity: 40 }),
    );
    await expect(service.deleteRoom('room-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('supprime une salle inutilisée', async () => {
    prisma.room.findUnique.mockResolvedValue({ id: 'room-1' });
    prisma.screening.count.mockResolvedValue(0);
    prisma.room.delete.mockResolvedValue({ id: 'room-1' });

    await expect(service.deleteRoom('room-1')).resolves.toEqual({ id: 'room-1' });
  });

  it('retourne 404 pour une salle inconnue', async () => {
    prisma.room.findUnique.mockResolvedValue(null);

    await expect(service.updateRoom('missing', { capacity: 10 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.deleteRoom('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crée un film', async () => {
    const dto = { title: 'Film', description: 'Description', durationMin: 95 };
    prisma.movie.create.mockResolvedValue({ id: 'movie-1', ...dto });

    await expect(service.createMovie(dto)).resolves.toEqual({ id: 'movie-1', ...dto });
    expect(prisma.movie.create).toHaveBeenCalledWith({ data: dto });
  });

  it('modifie un film existant', async () => {
    prisma.movie.findUnique.mockResolvedValue({ id: 'movie-1' });
    prisma.movie.update.mockResolvedValue({ id: 'movie-1', title: 'Nouveau titre' });

    await expect(service.updateMovie('movie-1', { title: 'Nouveau titre' })).resolves.toEqual({
      id: 'movie-1',
      title: 'Nouveau titre',
    });
    expect(prisma.movie.update).toHaveBeenCalledWith({
      where: { id: 'movie-1' },
      data: { title: 'Nouveau titre' },
    });
  });

  it('supprime un film sans réservation', async () => {
    prisma.movie.findUnique.mockResolvedValue({ id: 'movie-1' });
    prisma.reservation.count.mockResolvedValue(0);
    prisma.movie.delete.mockResolvedValue({ id: 'movie-1' });

    await expect(service.deleteMovie('movie-1')).resolves.toEqual({ id: 'movie-1' });
    expect(prisma.movie.delete).toHaveBeenCalledWith({ where: { id: 'movie-1' } });
  });

  it('protège un film qui possède des réservations', async () => {
    prisma.movie.findUnique.mockResolvedValue({ id: 'movie-1' });
    prisma.reservation.count.mockResolvedValue(1);

    await expect(service.deleteMovie('movie-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.movie.delete).not.toHaveBeenCalled();
  });

  it('retourne 404 pour la modification ou suppression d’un film inconnu', async () => {
    prisma.movie.findUnique.mockResolvedValue(null);

    await expect(service.updateMovie('missing', { title: 'Titre' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.deleteMovie('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crée une séance et ses places par rangées', async () => {
    prisma.movie.findUnique.mockResolvedValue({ id: 'movie-1' });
    prisma.screening.create.mockResolvedValue({ id: 'screening-1' });

    await service.createScreening({
      movieId: 'movie-1',
      startsAt: '2026-11-20T18:00:00.000Z',
      room: 'Salle 1',
      priceCents: 1200,
      seatCount: 12,
    });

    const call = prisma.screening.create.mock.calls[0][0];
    expect(call.data.roomId).toBe('room-1');
    expect(call.data.expectedRatio).toBe(0.6);
    expect(call.data.seats.create).toHaveLength(12);
    expect(call.data.seats.create[0]).toEqual({ label: 'A1' });
    expect(call.data.seats.create[10]).toEqual({ label: 'B1' });
  });

  it('refuse de créer une séance pour un film inconnu', async () => {
    prisma.movie.findUnique.mockResolvedValue(null);

    await expect(
      service.createScreening({
        movieId: 'missing',
        startsAt: '2026-11-20T18:00:00.000Z',
        room: 'Salle 1',
        priceCents: 1200,
        seatCount: 10,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('modifie une séance existante', async () => {
    prisma.screening.findUnique.mockResolvedValue({
      id: 'screening-1',
      _count: { seats: 12 },
    });
    prisma.screening.update.mockResolvedValue({ id: 'screening-1', room: 'Salle 2' });
    prisma.room.upsert.mockResolvedValue({ id: 'room-2', name: 'Salle 2' });

    await expect(service.updateScreening('screening-1', { room: 'Salle 2' })).resolves.toEqual({
      id: 'screening-1',
      room: 'Salle 2',
    });
    expect(prisma.screening.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'screening-1' },
        data: expect.objectContaining({ roomId: 'room-2' }),
      }),
    );
  });

  it('supprime une séance sans réservation', async () => {
    prisma.screening.findUnique.mockResolvedValue({ id: 'screening-1' });
    prisma.reservation.count.mockResolvedValue(0);
    prisma.screening.delete.mockResolvedValue({ id: 'screening-1' });

    await expect(service.deleteScreening('screening-1')).resolves.toEqual({ id: 'screening-1' });
    expect(prisma.screening.delete).toHaveBeenCalledWith({ where: { id: 'screening-1' } });
  });

  it('protège une séance qui possède des réservations', async () => {
    prisma.screening.findUnique.mockResolvedValue({ id: 'screening-1' });
    prisma.reservation.count.mockResolvedValue(1);

    await expect(service.deleteScreening('screening-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.screening.delete).not.toHaveBeenCalled();
  });

  it('retourne 404 pour une séance inconnue', async () => {
    prisma.screening.findUnique.mockResolvedValue(null);

    await expect(service.updateScreening('missing', { room: 'Salle 2' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.deleteScreening('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('liste les réservations récentes', async () => {
    prisma.reservation.findMany.mockResolvedValue([{ id: 'reservation-1' }]);

    await expect(service.listReservations()).resolves.toEqual([{ id: 'reservation-1' }]);
    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('libère les sièges lors de l’annulation', async () => {
    prisma.reservation.findUnique.mockResolvedValue({ id: 'r1' });
    tx.reservation.update.mockResolvedValue({
      id: 'r1',
      status: ReservationStatus.CANCELLED,
    });

    await service.updateReservation('r1', ReservationStatus.CANCELLED);

    expect(tx.reservationSeat.deleteMany).toHaveBeenCalledWith({
      where: { reservationId: 'r1' },
    });
    expect(tx.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CANCELLED' } }),
    );
    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REFUNDED' } }),
    );
  });

  it('conserve les sièges lorsque le billet est utilisé', async () => {
    prisma.reservation.findUnique.mockResolvedValue({ id: 'r1' });
    tx.reservation.update.mockResolvedValue({ id: 'r1', status: ReservationStatus.USED });

    await service.updateReservation('r1', ReservationStatus.USED);

    expect(tx.reservationSeat.deleteMany).not.toHaveBeenCalled();
    expect(tx.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'USED' }) }),
    );
    expect(tx.reservation.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: ReservationStatus.USED },
    });
  });

  it('retourne 404 pour une réservation inconnue', async () => {
    prisma.reservation.findUnique.mockResolvedValue(null);

    await expect(
      service.updateReservation('missing', ReservationStatus.USED),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('calcule le remplissage et la fréquentation estimée', async () => {
    prisma.screening.findMany.mockResolvedValue([
      {
        id: 's1',
        startsAt: new Date(),
        expectedRatio: 0.6,
        movie: { title: 'Film' },
        seats: [{ reservationSeats: [{}] }, { reservationSeats: [] }],
      },
      {
        id: 's2',
        startsAt: new Date(),
        expectedRatio: 0.5,
        movie: { title: 'Salle vide' },
        seats: [],
      },
    ]);

    await expect(service.analytics()).resolves.toEqual([
      expect.objectContaining({
        capacity: 2,
        occupied: 1,
        occupancyRate: 50,
        forecastAttendance: 1,
      }),
      expect.objectContaining({ capacity: 0, occupied: 0, occupancyRate: 0 }),
    ]);
  });
});
