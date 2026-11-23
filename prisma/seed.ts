import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
  for (const user of [
    { email: 'user@demo.cinema', password: 'DemoUser123!', role: Role.USER },
    { email: 'admin@demo.cinema', password: 'DemoAdmin123!', role: Role.ADMIN },
  ]) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash, role: user.role },
      create: { email: user.email, passwordHash, role: user.role },
    });
  }
  if (await prisma.movie.count()) return;
  const movie = await prisma.movie.create({
    data: {
      title: 'Le Voyage des Lumières',
      description: 'Film fictif de démonstration.',
      durationMin: 108,
    },
  });
  const startsAt = new Date(Date.now() + 2 * 86400000);
  const room = await prisma.room.create({ data: { name: 'Salle 1', capacity: 30 } });
  await prisma.screening.create({
    data: {
      movieId: movie.id,
      startsAt,
      roomId: room.id,
      priceCents: 1200,
      seats: {
        create: Array.from({ length: 30 }, (_, i) => ({
          label: `${String.fromCharCode(65 + Math.floor(i / 10))}${(i % 10) + 1}`,
        })),
      },
    },
  });
}
void main()
  .catch((error: unknown) => {
    console.error('Échec de l’initialisation des données', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
