import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { meetingController } from '../modules/meetings/meeting.controller.js';

export const meetingRouter = Router();

// All meeting routes require authentication
meetingRouter.use(requireAuth);

meetingRouter.post('/', (req, res) => {
  meetingController.createMeeting(req, res);
});

meetingRouter.get('/', (req, res) => {
  meetingController.listMeetings(req, res);
});

meetingRouter.get('/:meetingId', (req, res) => {
  meetingController.getMeeting(req, res);
});

meetingRouter.post('/:meetingId/start', (req, res) => {
  meetingController.startMeeting(req, res);
});

meetingRouter.post('/:meetingId/join', (req, res) => {
  meetingController.joinMeeting(req, res);
});

meetingRouter.post('/:meetingId/leave', (req, res) => {
  meetingController.leaveMeeting(req, res);
});

meetingRouter.post('/:meetingId/end', (req, res) => {
  meetingController.endMeeting(req, res);
});

meetingRouter.post('/:meetingId/host-transfer', (req, res) => {
  meetingController.transferHost(req, res);
});

meetingRouter.get('/:meetingId/participants', (req, res) => {
  meetingController.listParticipants(req, res);
});

meetingRouter.post('/:meetingId/participants/:userId/admit', (req, res) => {
  meetingController.admitParticipant(req, res);
});

meetingRouter.post('/:meetingId/participants/:userId/remove', (req, res) => {
  meetingController.removeParticipant(req, res);
});

meetingRouter.patch('/:meetingId/media-state', (req, res) => {
  meetingController.updateMediaState(req, res);
});

meetingRouter.get('/:meetingId/sync', (req, res) => {
  meetingController.syncMeeting(req, res);
});

// ============================================================================
// Phase 11: Advanced Meeting Controls & Moderation
// ============================================================================

meetingRouter.post('/:meetingId/lock', (req, res) => {
  meetingController.lockMeeting(req, res);
});

meetingRouter.post('/:meetingId/unlock', (req, res) => {
  meetingController.unlockMeeting(req, res);
});

meetingRouter.post('/:meetingId/cancel', (req, res) => {
  meetingController.cancelMeeting(req, res);
});

meetingRouter.post('/:meetingId/participants/:userId/deny', (req, res) => {
  meetingController.denyParticipant(req, res);
});

meetingRouter.post('/:meetingId/participants/:userId/mute', (req, res) => {
  meetingController.muteParticipant(req, res);
});

meetingRouter.post('/:meetingId/participants/:userId/stop-screenshare', (req, res) => {
  meetingController.stopParticipantScreenShare(req, res);
});

meetingRouter.get('/:meetingId/history', (req, res) => {
  meetingController.getMeetingHistory(req, res);
});

meetingRouter.get('/:meetingId/participant-history', (req, res) => {
  meetingController.getParticipantHistory(req, res);
});

// ============================================================================
// Phase 11: Meeting Recordings
// ============================================================================

meetingRouter.post('/:meetingId/recordings/start', (req, res) => {
  meetingController.startRecording(req, res);
});

meetingRouter.post('/:meetingId/recordings/stop', (req, res) => {
  meetingController.stopRecording(req, res);
});

meetingRouter.get('/:meetingId/recordings', (req, res) => {
  meetingController.listRecordings(req, res);
});

meetingRouter.get('/:meetingId/recordings/:recordingId', (req, res) => {
  meetingController.getRecording(req, res);
});

meetingRouter.get('/:meetingId/recordings/:recordingId/download-url', (req, res) => {
  meetingController.getRecordingDownloadUrl(req, res);
});

// ============================================================================
// Phase 11: Meeting Transcripts
// ============================================================================

meetingRouter.post('/:meetingId/transcripts', (req, res) => {
  meetingController.requestTranscription(req, res);
});

meetingRouter.get('/:meetingId/transcripts', (req, res) => {
  meetingController.listTranscripts(req, res);
});

meetingRouter.get('/:meetingId/transcripts/:transcriptId', (req, res) => {
  meetingController.getTranscript(req, res);
});

meetingRouter.post('/:meetingId/transcripts/:transcriptId/cancel', (req, res) => {
  meetingController.cancelTranscription(req, res);
});

meetingRouter.get('/:meetingId/transcripts/:transcriptId/download-url', (req, res) => {
  meetingController.getTranscriptDownloadUrl(req, res);
});

// ============================================================================
// Phase 11: Media Sessions, Telemetry, and Artifacts
// ============================================================================

meetingRouter.post('/:meetingId/media/join', (req, res) => {
  meetingController.joinMediaSession(req, res);
});

meetingRouter.post('/:meetingId/media/leave', (req, res) => {
  meetingController.leaveMediaSession(req, res);
});

meetingRouter.post('/:meetingId/network-quality', (req, res) => {
  meetingController.updateNetworkQuality(req, res);
});

meetingRouter.post('/:meetingId/active-speaker', (req, res) => {
  meetingController.reportActiveSpeaker(req, res);
});

meetingRouter.get('/:meetingId/artifacts', (req, res) => {
  meetingController.getArtifacts(req, res);
});

