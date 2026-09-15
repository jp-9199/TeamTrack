import type { Request, Response } from 'express';
import {
  meetingService,
  MeetingServiceError,
} from './meeting.service.js';
import {
  recordingService,
  RecordingServiceError,
} from './recording.service.js';
import {
  transcriptService,
  TranscriptServiceError,
} from './transcript.service.js';
import {
  mediaSessionService,
  MediaSessionServiceError,
} from './mediaSession.service.js';
import {
  validateCreateMeetingRequest,
  validateHostTransferRequest,
  validateUpdateMediaStateRequest,
} from '@teamtrack/validation';

export class MeetingController {
  async createMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const validation = validateCreateMeetingRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: validation.errors[0]?.message || 'Validation failed',
            details: validation.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const meeting = await meetingService.createMeeting(userId, validation.data);
      res.status(201).json({
        success: true,
        data: { meeting },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async listMeetings(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const orgId = req.query.organizationId as string;
      if (!orgId) {
        res.status(400).json({
          success: false,
          error: { code: 'MISSING_ORGANIZATION_ID', message: 'organizationId query parameter is required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const meetings = await meetingService.listMeetings(userId, orgId);
      res.status(200).json({
        success: true,
        data: { meetings },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async getMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;

      const meeting = await meetingService.getMeeting(userId, meetingId);
      res.status(200).json({
        success: true,
        data: { meeting },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async startMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;

      const meeting = await meetingService.startMeeting(userId, meetingId);
      res.status(200).json({
        success: true,
        data: { meeting },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async joinMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;

      const result = await meetingService.joinMeeting(userId, meetingId);
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async leaveMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;

      await meetingService.leaveMeeting(userId, meetingId);
      res.status(200).json({
        success: true,
        data: { message: 'Left meeting successfully' },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async admitParticipant(req: Request, res: Response): Promise<void> {
    try {
      const hostUserId = (req as any).user.id;
      const { meetingId, userId: targetUserId } = req.params;

      const participant = await meetingService.admitParticipant(hostUserId, meetingId, targetUserId);
      res.status(200).json({
        success: true,
        data: { participant },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async removeParticipant(req: Request, res: Response): Promise<void> {
    try {
      const hostUserId = (req as any).user.id;
      const { meetingId, userId: targetUserId } = req.params;

      await meetingService.removeParticipant(hostUserId, meetingId, targetUserId);
      res.status(200).json({
        success: true,
        data: { message: 'Participant removed successfully' },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async endMeeting(req: Request, res: Response): Promise<void> {
    try {
      const hostUserId = (req as any).user.id;
      const { meetingId } = req.params;

      const meeting = await meetingService.endMeeting(hostUserId, meetingId);
      res.status(200).json({
        success: true,
        data: { meeting },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async transferHost(req: Request, res: Response): Promise<void> {
    try {
      const hostUserId = (req as any).user.id;
      const { meetingId } = req.params;

      const validation = validateHostTransferRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: validation.errors[0]?.message || 'Validation failed',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const meeting = await meetingService.transferHost(hostUserId, meetingId, validation.data);
      res.status(200).json({
        success: true,
        data: { meeting },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async updateMediaState(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;

      const validation = validateUpdateMediaStateRequest(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: validation.errors[0]?.message || 'Validation failed',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const participant = await meetingService.updateMediaState(userId, meetingId, validation.data);
      res.status(200).json({
        success: true,
        data: { participant },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async listParticipants(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;

      const participants = await meetingService.listParticipants(userId, meetingId);
      res.status(200).json({
        success: true,
        data: { participants },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async syncMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const since = (req.query.since as string) || new Date(0).toISOString();

      const syncData = await meetingService.syncMeeting(userId, meetingId, since);
      res.status(200).json({
        success: true,
        data: syncData,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  // ==========================================================================
  // Phase 11: Advanced Controls, Moderation, Telemetry, and Artifacts
  // ==========================================================================

  async lockMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const meeting = await meetingService.lockMeeting(userId, meetingId);
      res.status(200).json({
        success: true,
        data: { meeting },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async unlockMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const meeting = await meetingService.unlockMeeting(userId, meetingId);
      res.status(200).json({
        success: true,
        data: { meeting },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async cancelMeeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const meeting = await meetingService.cancelMeeting(userId, meetingId);
      res.status(200).json({
        success: true,
        data: { meeting },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async denyParticipant(req: Request, res: Response): Promise<void> {
    try {
      const hostUserId = (req as any).user.id;
      const { meetingId, userId: targetUserId } = req.params;
      await meetingService.denyParticipant(hostUserId, meetingId, targetUserId);
      res.status(200).json({
        success: true,
        data: { message: 'Participant denied successfully' },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async muteParticipant(req: Request, res: Response): Promise<void> {
    try {
      const hostUserId = (req as any).user.id;
      const { meetingId, userId: targetUserId } = req.params;
      const participant = await meetingService.muteParticipant(hostUserId, meetingId, targetUserId);
      res.status(200).json({
        success: true,
        data: { participant },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async stopParticipantScreenShare(req: Request, res: Response): Promise<void> {
    try {
      const hostUserId = (req as any).user.id;
      const { meetingId, userId: targetUserId } = req.params;
      const participant = await meetingService.stopParticipantScreenShare(hostUserId, meetingId, targetUserId);
      res.status(200).json({
        success: true,
        data: { participant },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async getMeetingHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const history = await meetingService.getMeetingHistory(userId, meetingId);
      res.status(200).json({
        success: true,
        data: history,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async getParticipantHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const history = await meetingService.getParticipantHistory(userId, meetingId);
      res.status(200).json({
        success: true,
        data: { participants: history },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  // --- Recordings ---

  async startRecording(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const recording = await recordingService.startRecording(userId, meetingId);
      res.status(201).json({
        success: true,
        data: { recording },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async stopRecording(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const recording = await recordingService.stopRecording(userId, meetingId);
      res.status(200).json({
        success: true,
        data: { recording },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async listRecordings(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const recordings = await recordingService.listRecordings(userId, meetingId);
      res.status(200).json({
        success: true,
        data: { recordings },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async getRecording(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { recordingId } = req.params;
      const recording = await recordingService.getRecording(userId, recordingId);
      res.status(200).json({
        success: true,
        data: { recording },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async getRecordingDownloadUrl(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { recordingId } = req.params;
      const downloadData = await recordingService.getRecordingDownloadUrl(userId, recordingId);
      res.status(200).json({
        success: true,
        data: downloadData,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  // --- Transcripts ---

  async requestTranscription(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const { recordingId, language } = req.body || {};
      const transcript = await transcriptService.requestTranscription(userId, meetingId, recordingId, language);
      res.status(201).json({
        success: true,
        data: { transcript },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async cancelTranscription(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { transcriptId } = req.params;
      const transcript = await transcriptService.cancelTranscription(userId, transcriptId);
      res.status(200).json({
        success: true,
        data: { transcript },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async listTranscripts(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const transcripts = await transcriptService.listTranscripts(userId, meetingId);
      res.status(200).json({
        success: true,
        data: { transcripts },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async getTranscript(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { transcriptId } = req.params;
      const transcript = await transcriptService.getTranscript(userId, transcriptId);
      res.status(200).json({
        success: true,
        data: { transcript },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async getTranscriptDownloadUrl(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { transcriptId } = req.params;
      const downloadData = await transcriptService.getTranscriptDownloadUrl(userId, transcriptId);
      res.status(200).json({
        success: true,
        data: downloadData,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  // --- Media Sessions & Telemetry ---

  async joinMediaSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const { provider, providerSessionId } = req.body || {};
      const session = await mediaSessionService.joinMediaSession(userId, meetingId, provider, providerSessionId);
      res.status(200).json({
        success: true,
        data: { session },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async leaveMediaSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      await mediaSessionService.leaveMediaSession(userId, meetingId);
      res.status(200).json({
        success: true,
        data: { message: 'Left media session' },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async updateNetworkQuality(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const { quality } = req.body || {};
      if (!quality) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_FAILED', message: 'quality field is required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }
      await mediaSessionService.updateNetworkQuality(userId, meetingId, quality);
      res.status(200).json({
        success: true,
        data: { message: 'Network quality updated' },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async reportActiveSpeaker(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const { speakerUserId, audioLevel } = req.body || {};
      if (!speakerUserId) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_FAILED', message: 'speakerUserId is required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }
      await mediaSessionService.reportActiveSpeaker(userId, meetingId, speakerUserId, audioLevel);
      res.status(200).json({
        success: true,
        data: { message: 'Active speaker reported' },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  async getArtifacts(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const { meetingId } = req.params;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const cursor = req.query.cursor as string | undefined;
      const artifacts = await mediaSessionService.getArtifacts(userId, meetingId, limit, cursor);
      res.status(200).json({
        success: true,
        data: artifacts,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      this.handleError(err, res);
    }
  }

  private handleError(err: any, res: Response): void {
    if (err instanceof MeetingServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (err instanceof RecordingServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (err instanceof TranscriptServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (err instanceof MediaSessionServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (err.statusCode && err.code) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    console.error('[MeetingController Unhandled Error]:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected internal error occurred' },
      timestamp: new Date().toISOString(),
    });
  }
}

export const meetingController = new MeetingController();

