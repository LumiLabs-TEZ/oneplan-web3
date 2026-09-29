import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateReceiptExpenseDto } from './dto/create-receipt-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { SettleShareDto } from './dto/settle-share.dto';
import { ExpenseDto } from './dto/expense.dto';
import { ExpenseSummaryDto } from './dto/expense-summary.dto';
import { ExpenseShareDto } from './dto/expense-share.dto';
import { TripBreakdownDto } from './dto/expense-breakdown.dto';
import {
  TripSettlementSummaryDto,
  SettleCounterpartyDto,
} from './dto/trip-settlement.dto';

@ApiBearerAuth()
@ApiTags('Expenses')
@Controller('trips/:tripId/expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @ApiOperation({
    operationId: 'createExpense',
    summary: 'Create a new expense for a trip',
  })
  @ApiParam({ name: 'tripId', type: 'integer' })
  @ApiCreatedResponse({ type: ExpenseDto })
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  createExpense(
    @CurrentUser('sub') userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: CreateExpenseDto,
  ): Promise<ExpenseDto> {
    return this.expensesService.createExpense(tripId, userId, dto);
  }

  @Post('receipt')
  @ApiOperation({
    operationId: 'createReceiptExpense',
    summary: 'Create a single expense from receipt item assignments',
  })
  @ApiParam({ name: 'tripId', type: 'integer' })
  @ApiCreatedResponse({ type: ExpenseDto })
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  createReceiptExpense(
    @CurrentUser('sub') userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: CreateReceiptExpenseDto,
  ): Promise<ExpenseDto> {
    return this.expensesService.createReceiptExpense(tripId, userId, dto);
  }

  @Get()
  @ApiOperation({
    operationId: 'listExpenses',
    summary: 'List expenses for a trip with optional filters',
  })
  @ApiParam({ name: 'tripId', type: 'integer' })
  @ApiOkResponse({ type: [ExpenseSummaryDto] })
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  listExpenses(
    @CurrentUser('sub') userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @Query() query: ListExpensesQueryDto,
  ): Promise<ExpenseSummaryDto[]> {
    return this.expensesService.listExpenses(tripId, userId, query);
  }

  @Get('breakdown')
  @ApiOperation({
    operationId: 'getTripBreakdown',
    summary: 'Get per-member expense breakdown for a trip',
  })
  @ApiParam({ name: 'tripId', type: 'integer' })
  @ApiOkResponse({ type: TripBreakdownDto })
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  getTripBreakdown(
    @CurrentUser('sub') userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
  ): Promise<TripBreakdownDto> {
    return this.expensesService.getTripBreakdown(tripId, userId);
  }

  @Post('settle-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'settleAllShares',
    summary: 'Settle all unsettled expense shares for the current user',
  })
  @ApiParam({ name: 'tripId', type: 'integer' })
  @ApiOkResponse({ type: TripBreakdownDto })
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  settleAllShares(
    @CurrentUser('sub') userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
  ): Promise<TripBreakdownDto> {
    return this.expensesService.settleAllShares(tripId, userId);
  }

  @Get('settlements')
  @ApiOperation({
    operationId: 'getTripSettlements',
    summary: 'Get pairwise (your-POV) who-owes-whom settlements for a trip',
  })
  @ApiParam({ name: 'tripId', type: 'integer' })
  @ApiOkResponse({ type: TripSettlementSummaryDto })
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  getTripSettlements(
    @CurrentUser('sub') userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
  ): Promise<TripSettlementSummaryDto> {
    return this.expensesService.getTripSettlements(tripId, userId);
  }

  @Post('settlements/settle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'settleCounterparty',
    summary: 'Settle all unsettled shares between you and one counterparty',
  })
  @ApiParam({ name: 'tripId', type: 'integer' })
  @ApiOkResponse({ type: TripSettlementSummaryDto })
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  settleCounterparty(
    @CurrentUser('sub') userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: SettleCounterpartyDto,
  ): Promise<TripSettlementSummaryDto> {
    return this.expensesService.settleCounterparty(tripId, userId, dto);
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'getExpense',
    summary: 'Get expense details with shares',
  })
  @ApiParam({ name: 'tripId', type: 'integer' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: ExpenseDto })
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  @ApiNotFoundResponse({ description: 'Expense not found' })
  getExpense(
    @CurrentUser('sub') userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ExpenseDto> {
    return this.expensesService.getExpense(tripId, id, userId);
  }

  @Patch(':id')
  @ApiOperation({
    operationId: 'updateExpense',
    summary: 'Update an expense',
  })
  @ApiParam({ name: 'tripId', type: 'integer' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiOkResponse({ type: ExpenseDto })
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  @ApiNotFoundResponse({ description: 'Expense not found' })
  updateExpense(
    @CurrentUser('sub') userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
  ): Promise<ExpenseDto> {
    return this.expensesService.updateExpense(tripId, id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteExpense',
    summary: 'Delete an expense',
  })
  @ApiParam({ name: 'tripId', type: 'integer' })
  @ApiParam({ name: 'id', type: 'integer' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Not a member of this trip' })
  @ApiNotFoundResponse({ description: 'Expense not found' })
  deleteExpense(
    @CurrentUser('sub') userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.expensesService.deleteExpense(tripId, id, userId);
  }

  @Patch(':id/shares/:shareId')
  @ApiOperation({
    operationId: 'settleExpenseShare',
    summary: 'Settle or unsettle an expense share',
  })
  @ApiParam({ name: 'tripId', type: 'integer' })
  @ApiParam({ name: 'id', type: 'integer', description: 'Expense ID' })
  @ApiParam({
    name: 'shareId',
    type: 'integer',
    description: 'Expense share ID',
  })
  @ApiOkResponse({ type: ExpenseShareDto })
  @ApiForbiddenResponse({
    description: 'Not a member or not the share owner',
  })
  @ApiNotFoundResponse({ description: 'Expense share not found' })
  settleExpenseShare(
    @CurrentUser('sub') userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('shareId', ParseIntPipe) shareId: number,
    @Body() dto: SettleShareDto,
  ): Promise<ExpenseShareDto> {
    return this.expensesService.settleExpenseShare(
      tripId,
      id,
      shareId,
      userId,
      dto,
    );
  }
}
