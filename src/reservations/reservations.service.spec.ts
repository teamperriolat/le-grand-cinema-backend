import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentStatus, ReservationStatus } from '@prisma/client';
import { ReservationsService } from './reservations.service';

describe('ReservationsService', () => {
  const tx = {
    screening: { findUnique: jest.fn() },
    seat: { findMany: jest.fn() },
    reservationSeat: { count: jest.fn() },
    reservation: { create: jest.fn() },
    payment: { update: jest.fn() },
    ticket: { update: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown): Promise<unknown> =>
      Promise.resolve(callback(tx)),
    ),
    reservation: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const service = new ReservationsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.screening.findUnique.mockResolvedValue({ id: 'screening-1', priceCents: 1200 });
    tx.seat.findMany.mockResolvedValue([{ id: 'seat-1' }]);
    tx.reservationSeat.count.mockResolvedValue(0);
    tx.reservation.create.mockResolvedValue({ id: 'reservation-1' });
  });

  it('crée la réservation dans une transaction sérialisable', async () => {
    await expect(
      service.create('user-1', { screeningId: 'screening-1', seatIds: ['seat-1'] }),
    ).resolves.toEqual({ id: 'reservation-1' });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.reservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', totalCents: 1200 }),
      }),
    );
  });

  it('refuse un identifiant de siège répété', async () => {
    await expect(
      service.create('user-1', { screeningId: 'screening-1', seatIds: ['seat-1', 'seat-1'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('retourne 404 quand la séance est absente', async () => {
    tx.screening.findUnique.mockResolvedValue(null);
    await expect(
      service.create('user-1', { screeningId: 'missing', seatIds: ['seat-1'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuse un siège qui ne correspond pas à la séance', async () => {
    tx.seat.findMany.mockResolvedValue([]);
    await expect(
      service.create('user-1', { screeningId: 'screening-1', seatIds: ['other'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retourne 409 quand le siège est occupé', async () => {
    tx.reservationSeat.count.mockResolvedValue(1);
    await expect(
      service.create('user-1', { screeningId: 'screening-1', seatIds: ['seat-1'] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('convertit une violation de contrainte concurrente en 409', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    await expect(
      service.create('user-1', { screeningId: 'screening-1', seatIds: ['seat-1'] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('convertit un conflit de transaction sérialisable en 409', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    await expect(
      service.create('user-1', { screeningId: 'screening-1', seatIds: ['seat-1'] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('calcule le montant selon le nombre de sièges', async () => {
    tx.seat.findMany.mockResolvedValue([{ id: 'seat-1' }, { id: 'seat-2' }]);
    await service.create('user-1', { screeningId: 'screening-1', seatIds: ['seat-1', 'seat-2'] });
    expect(tx.reservation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalCents: 2400 }) }),
    );
  });

  it('propage une erreur transactionnelle pour garantir le rollback', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('transaction aborted'));
    await expect(
      service.create('user-1', { screeningId: 'screening-1', seatIds: ['seat-1'] }),
    ).rejects.toThrow('transaction aborted');
  });

  it('liste les réservations de l’utilisateur', async () => {
    prisma.reservation.findMany.mockResolvedValue([{ id: 'reservation-1' }]);
    await expect(service.listMine('user-1')).resolves.toHaveLength(1);
    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('retourne le billet numérique du propriétaire', async () => {
    prisma.reservation.findFirst.mockResolvedValue({
      id: 'reservation-1',
      ticket: { code: 'ticket-1', status: 'ACTIVE' },
      payment: { status: 'PAID' },
    });
    await expect(service.ticket('user-1', 'reservation-1')).resolves.toEqual(
      expect.objectContaining({ ticketCode: 'ticket-1' }),
    );
  });

  it('refuse un billet absent ou appartenant à un autre utilisateur', async () => {
    prisma.reservation.findFirst.mockResolvedValue(null);
    await expect(service.ticket('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('paie une réservation et active son billet', async () => {
    prisma.reservation.findFirst.mockResolvedValue({
      id: 'reservation-1',
      status: ReservationStatus.CONFIRMED,
      payment: { status: PaymentStatus.PENDING },
    });
    tx.payment.update.mockResolvedValue({
      reservationId: 'reservation-1',
      status: PaymentStatus.PAID,
    });

    await expect(service.pay('user-1', 'reservation-1')).resolves.toEqual(
      expect.objectContaining({ status: PaymentStatus.PAID }),
    );
    expect(tx.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACTIVE' } }),
    );
  });

  it('refuse le paiement d’une réservation annulée', async () => {
    prisma.reservation.findFirst.mockResolvedValue({
      id: 'reservation-1',
      status: ReservationStatus.CANCELLED,
      payment: { status: PaymentStatus.PENDING },
    });

    await expect(service.pay('user-1', 'reservation-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
