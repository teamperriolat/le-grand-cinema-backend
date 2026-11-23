import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards';
import { JwtPayload } from '../auth/jwt.strategy';
import { ReservationsService } from './reservations.service';
export class CreateReservationDto {
  @ApiProperty() @IsString() screeningId: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  seatIds: string[];
}
@ApiTags('reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly service: ReservationsService) {}
  @Post()
  @ApiOperation({ summary: 'Réserver atomiquement une ou plusieurs places' })
  @ApiCreatedResponse({ description: 'Réservation confirmée avec montant et code billet' })
  @ApiBadRequestResponse({ description: 'Sélection de places invalide' })
  @ApiUnauthorizedResponse({ description: 'Jeton JWT absent ou invalide' })
  @ApiNotFoundResponse({ description: 'Séance introuvable' })
  @ApiConflictResponse({ description: 'Une place est déjà réservée' })
  create(@Req() req: { user: JwtPayload }, @Body() dto: CreateReservationDto) {
    return this.service.create(req.user.sub, dto);
  }
  @Get() list(@Req() req: { user: JwtPayload }) {
    return this.service.listMine(req.user.sub);
  }
  @Get(':id/ticket') ticket(@Req() req: { user: JwtPayload }, @Param('id') id: string) {
    return this.service.ticket(req.user.sub, id);
  }
  @Post(':id/payment')
  @ApiOperation({ summary: 'Simuler le paiement sécurisé de la réservation' })
  payment(@Req() req: { user: JwtPayload }, @Param('id') id: string) {
    return this.service.pay(req.user.sub, id);
  }
}
