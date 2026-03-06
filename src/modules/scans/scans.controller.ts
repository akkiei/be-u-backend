import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ScansService } from './scans.service';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import type { User } from '../../database/schema/users.schema';
import { ProductScanDto } from './dto/product-scan.dto';
import { PrescriptionScanDto } from './dto/prescription-scan.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';

@Controller('scans')
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Get()
  async getScans(@CurrentUser() user: User) {
    return this.scansService.getScans(user.id);
  }

  @Post('product')
  async createProductScan(
    @CurrentUser() user: User,
    @Body() dto: ProductScanDto,
  ) {
    return this.scansService.createProductScan(user.id, dto);
  }

  @Post('prescription')
  async createPrescriptionScan(
    @CurrentUser() user: User,
    @Body() dto: PrescriptionScanDto,
  ) {
    return this.scansService.createPrescriptionScan(user.id, dto);
  }

  @Patch('product/:id')
  async updateProduct(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.scansService.updateProduct(user.id, id, dto);
  }

  @Patch('label/:id')
  async updateLabel(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabelDto,
  ) {
    return this.scansService.updateLabel(user.id, id, dto);
  }

  @Patch('ingredient/:id')
  async updateIngredient(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.scansService.updateIngredient(user.id, id, dto);
  }

  @Patch('prescription/:id')
  async updatePrescription(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrescriptionDto,
  ) {
    return this.scansService.updatePrescription(user.id, id, dto);
  }

  @Patch('medication/:id')
  async updateMedication(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMedicationDto,
  ) {
    return this.scansService.updateMedication(user.id, id, dto);
  }
}
