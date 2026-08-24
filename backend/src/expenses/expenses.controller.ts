import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SYSTEM_ROLES } from '../auth/constants/roles.constant';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import {
  ExpenseCategoryQueryDto,
  ExpenseQueryDto,
} from './dto/expense-query.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesService } from './expenses.service';

const EXPENSE_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
  SYSTEM_ROLES.CASHIER,
] as const;

const EXPENSE_MODIFY_ROLES = [
  SYSTEM_ROLES.OWNER,
  SYSTEM_ROLES.ADMIN,
  SYSTEM_ROLES.MANAGER,
  SYSTEM_ROLES.ACCOUNTANT,
] as const;

const EXPENSE_REPORT_ROLES = EXPENSE_MODIFY_ROLES;

@ApiTags('Expenses')
@ApiBearerAuth()
@Permissions('expenses.manage')
@Roles(...EXPENSE_ROLES)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post('categories')
  @Roles(...EXPENSE_MODIFY_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create expense category' })
  @ApiCreatedResponse({ description: 'Expense category created' })
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExpenseCategoryDto,
  ) {
    return this.expensesService.createCategory(user.businessId, dto, user);
  }

  @Get('categories')
  @ApiOperation({ summary: 'View expense categories' })
  @ApiOkResponse({ description: 'Expense categories for current business' })
  categories(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseCategoryQueryDto,
  ) {
    return this.expensesService.findCategories(user.businessId, query);
  }

  @Patch('categories/:id')
  @Roles(...EXPENSE_MODIFY_ROLES)
  @ApiOperation({ summary: 'Update expense category' })
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    return this.expensesService.updateCategory(user.businessId, id, dto, user);
  }

  @Patch('categories/:id/activate')
  @Roles(...EXPENSE_MODIFY_ROLES)
  @ApiOperation({ summary: 'Activate expense category' })
  activateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.expensesService.activateCategory(user.businessId, id, user);
  }

  @Patch('categories/:id/deactivate')
  @Roles(...EXPENSE_MODIFY_ROLES)
  @ApiOperation({ summary: 'Deactivate expense category' })
  deactivateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.expensesService.deactivateCategory(user.businessId, id, user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create expense' })
  @ApiCreatedResponse({
    description:
      'Expense created with optional cash register transaction and audit log',
  })
  createExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.createExpense(user.businessId, dto, user);
  }

  @Get()
  @Roles(...EXPENSE_REPORT_ROLES)
  @ApiOperation({ summary: 'List expenses' })
  @ApiOkResponse({
    description:
      'Paginated expenses with filtering, sorting, search, and summary totals',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expensesService.findAll(user.businessId, query);
  }

  @Get('search')
  @Roles(...EXPENSE_REPORT_ROLES)
  @ApiOperation({ summary: 'Search expenses' })
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q: string,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expensesService.search(user.businessId, q ?? '', query);
  }

  @Get('summary')
  @Roles(...EXPENSE_REPORT_ROLES)
  @ApiOperation({ summary: 'View expense summary report' })
  @ApiOkResponse({
    description:
      'Expense summary with totals by category and payment method using database aggregation',
  })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expensesService.getSummary(user.businessId, query);
  }

  @Get('daily')
  @Roles(...EXPENSE_REPORT_ROLES)
  @ApiOperation({ summary: 'View daily expense report' })
  daily(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expensesService.getDailyReport(user.businessId, query);
  }

  @Get('weekly')
  @Roles(...EXPENSE_REPORT_ROLES)
  @ApiOperation({ summary: 'View weekly expense report' })
  weekly(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expensesService.getWeeklyReport(user.businessId, query);
  }

  @Get('monthly')
  @Roles(...EXPENSE_REPORT_ROLES)
  @ApiOperation({ summary: 'View monthly expense report' })
  monthly(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expensesService.getMonthlyReport(user.businessId, query);
  }

  @Get('yearly')
  @Roles(...EXPENSE_REPORT_ROLES)
  @ApiOperation({ summary: 'View yearly expense report' })
  yearly(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expensesService.getYearlyReport(user.businessId, query);
  }

  @Get(':id')
  @Roles(...EXPENSE_REPORT_ROLES)
  @ApiOperation({ summary: 'View expense details' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.expensesService.findOne(user.businessId, id);
  }

  @Patch(':id')
  @Roles(...EXPENSE_MODIFY_ROLES)
  @ApiOperation({ summary: 'Update expense' })
  updateExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.updateExpense(user.businessId, id, dto, user);
  }
}
