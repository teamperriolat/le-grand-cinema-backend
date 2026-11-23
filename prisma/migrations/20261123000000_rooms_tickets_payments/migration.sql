CREATE TYPE "TicketStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'USED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUSED', 'REFUNDED');

CREATE TABLE "Room" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Room_name_key" ON "Room"("name");

INSERT INTO "Room" ("id", "name", "capacity")
SELECT
  'room_' || md5(room_counts."room"),
  room_counts."room",
  GREATEST(MAX(room_counts."seatCount")::INTEGER, 1)
FROM (
  SELECT s."room", s."id", COUNT(seat."id") AS "seatCount"
  FROM "Screening" s
  LEFT JOIN "Seat" seat ON seat."screeningId" = s."id"
  GROUP BY s."room", s."id"
) room_counts
GROUP BY room_counts."room";

ALTER TABLE "Screening" ADD COLUMN "roomId" TEXT;
UPDATE "Screening"
SET "roomId" = 'room_' || md5("room")
WHERE "roomId" IS NULL;
ALTER TABLE "Screening" ALTER COLUMN "roomId" SET NOT NULL;
ALTER TABLE "Screening" DROP COLUMN "room";
ALTER TABLE "Screening"
  ADD CONSTRAINT "Screening_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Ticket" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "status" "TicketStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validatedAt" TIMESTAMP(3),
  CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ticket_code_key" ON "Ticket"("code");
CREATE UNIQUE INDEX "Ticket_reservationId_key" ON "Ticket"("reservationId");

INSERT INTO "Ticket" ("id", "code", "reservationId", "status", "validatedAt")
SELECT
  'ticket_' || r."id",
  r."ticketCode",
  r."id",
  CASE
    WHEN r."status" = 'USED' THEN 'USED'::"TicketStatus"
    WHEN r."status" = 'CANCELLED' THEN 'CANCELLED'::"TicketStatus"
    ELSE 'ACTIVE'::"TicketStatus"
  END,
  CASE WHEN r."status" = 'USED' THEN CURRENT_TIMESTAMP ELSE NULL END
FROM "Reservation" r;

ALTER TABLE "Reservation" DROP COLUMN "ticketCode";
ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_reservationId_key" ON "Payment"("reservationId");

INSERT INTO "Payment" ("id", "reservationId", "amountCents", "status", "paidAt")
SELECT 'payment_' || r."id", r."id", r."totalCents", 'PAID'::"PaymentStatus", r."createdAt"
FROM "Reservation" r;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
