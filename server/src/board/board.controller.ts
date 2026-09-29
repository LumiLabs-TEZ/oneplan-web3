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
import { BoardService } from './board.service';
import { BoardDto, BoardSummaryDto } from './dto/board.dto';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { AddPinsToBoardDto } from './dto/add-pins-to-board.dto';
import {
  BoardDescriptionDto,
  GenerateBoardDescriptionDto,
} from './dto/generate-board-description.dto';
import { GenerateTripFromBoardDto } from './dto/generate-trip-from-board.dto';
import { GenerateTripFromPinsDto } from './dto/generate-trip-from-pins.dto';
import { TripDto } from '../trips/dto/trip.dto';

@ApiBearerAuth()
@ApiTags('Board')
@Controller('board')
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @Get()
  @ApiOperation({
    operationId: 'listMyBoards',
    summary: "List the caller's boards with pin counts",
  })
  @ApiOkResponse({ type: [BoardSummaryDto] })
  listMyBoards(@CurrentUser('sub') userId: number): Promise<BoardSummaryDto[]> {
    return this.boardService.listMyBoards(userId);
  }

  @Post()
  @ApiOperation({ operationId: 'createBoard', summary: 'Create a new board' })
  @ApiCreatedResponse({ type: BoardSummaryDto })
  createBoard(
    @CurrentUser('sub') userId: number,
    @Body() dto: CreateBoardDto,
  ): Promise<BoardSummaryDto> {
    return this.boardService.createBoard(userId, dto);
  }

  @Post('generate-description')
  @ApiOperation({
    operationId: 'generateBoardDescription',
    summary:
      'Generate an AI-written board description from a title and location',
  })
  @ApiOkResponse({ type: BoardDescriptionDto })
  generateBoardDescription(
    @Body() dto: GenerateBoardDescriptionDto,
  ): Promise<BoardDescriptionDto> {
    return this.boardService.generateDescription(dto);
  }

  // Static segment declared before the ':boardId' routes so it never reaches
  // ParseIntPipe.
  @Post('pins/generate-trip')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'generateTripFromPins',
    summary:
      'Arrange inline (unsaved) pins into a new multi-day trip via AI, ' +
      'without creating a board',
  })
  @ApiCreatedResponse({ type: TripDto })
  generateTripFromPins(
    @CurrentUser('sub') userId: number,
    @Body() dto: GenerateTripFromPinsDto,
  ): Promise<TripDto> {
    return this.boardService.generateTripFromPins(userId, dto);
  }

  @Get(':boardId')
  @ApiOperation({
    operationId: 'getBoard',
    summary: 'Get a board with its pins',
  })
  @ApiParam({ name: 'boardId', type: 'integer' })
  @ApiOkResponse({ type: BoardDto })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse()
  getBoard(
    @CurrentUser('sub') userId: number,
    @Param('boardId', ParseIntPipe) boardId: number,
  ): Promise<BoardDto> {
    return this.boardService.getBoard(userId, boardId);
  }

  @Patch(':boardId')
  @ApiOperation({
    operationId: 'updateBoard',
    summary: 'Update a board',
  })
  @ApiParam({ name: 'boardId', type: 'integer' })
  @ApiOkResponse({ type: BoardSummaryDto })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse()
  updateBoard(
    @CurrentUser('sub') userId: number,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Body() dto: UpdateBoardDto,
  ): Promise<BoardSummaryDto> {
    return this.boardService.updateBoard(userId, boardId, dto);
  }

  @Post(':boardId/pins')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'addPinsToBoard',
    summary: 'Append pins to a board, skipping ones already on it',
  })
  @ApiParam({ name: 'boardId', type: 'integer' })
  @ApiOkResponse({ type: BoardDto })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse()
  addPinsToBoard(
    @CurrentUser('sub') userId: number,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Body() dto: AddPinsToBoardDto,
  ): Promise<BoardDto> {
    return this.boardService.addPinsToBoard(userId, boardId, dto);
  }

  @Post(':boardId/generate-trip')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'generateTripFromBoard',
    summary: 'Arrange selected board pins into a new multi-day trip via AI',
  })
  @ApiParam({ name: 'boardId', type: 'integer' })
  @ApiCreatedResponse({ type: TripDto })
  @ApiNotFoundResponse()
  @ApiForbiddenResponse()
  generateTripFromBoard(
    @CurrentUser('sub') userId: number,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Body() dto: GenerateTripFromBoardDto,
  ): Promise<TripDto> {
    return this.boardService.generateTrip(userId, boardId, dto);
  }

  @Delete(':boardId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteBoard',
    summary: 'Delete a board and all of its pins',
  })
  @ApiParam({ name: 'boardId', type: 'integer' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiForbiddenResponse()
  deleteBoard(
    @CurrentUser('sub') userId: number,
    @Param('boardId', ParseIntPipe) boardId: number,
  ): Promise<void> {
    return this.boardService.deleteBoard(userId, boardId);
  }

  @Delete(':boardId/pins/:pinId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteBoardPin',
    summary: 'Delete a pin from a board',
  })
  @ApiParam({ name: 'boardId', type: 'integer' })
  @ApiParam({ name: 'pinId', type: 'integer' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiForbiddenResponse()
  deleteBoardPin(
    @CurrentUser('sub') userId: number,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('pinId', ParseIntPipe) pinId: number,
  ): Promise<void> {
    return this.boardService.deleteBoardPin(userId, boardId, pinId);
  }
}
