import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import type {
  CalendarEventWithDetails,
  CalendarAttendeeResponseStatus,
} from '@teamtrack/shared-types';

export interface MobileCalendarScreenProps {
  events?: CalendarEventWithDetails[];
  onRsvp?: (eventId: string, status: CalendarAttendeeResponseStatus) => Promise<void>;
  onJoinMeeting?: (meetingId: string) => void;
  onClose: () => void;
}

const SAMPLE_EVENTS: CalendarEventWithDetails[] = [
  {
    id: 'mob-ev-1',
    organizationId: 'org-1',
    teamId: 'team-1',
    organizerUserId: 'user-1',
    title: 'Sprint Planning & Backlog Sync',
    description: 'Weekly team sprint planning and priority mapping for Phase 10.',
    location: 'Conference Room 3A',
    startAt: '2026-09-15T10:00:00.000Z',
    endAt: '2026-09-15T11:00:00.000Z',
    timezone: 'UTC',
    allDay: false,
    visibility: 'ORGANIZATION',
    status: 'confirmed',
    meetingId: 'meet-1',
    recurrenceRule: null,
    recurrenceUntil: null,
    recurrenceTimezone: null,
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
    deletedAt: null,
    organizer: {
      id: 'user-1',
      displayName: 'Alex Rivers',
      email: 'alex.rivers@example.com',
      avatarUrl: null,
    },
    attendees: [
      {
        id: 'att-1',
        eventId: 'mob-ev-1',
        userId: 'user-1',
        responseStatus: 'ACCEPTED',
        isOrganizer: true,
        respondedAt: '2026-09-14T10:00:00.000Z',
        createdAt: '2026-09-14T10:00:00.000Z',
        updatedAt: '2026-09-14T10:00:00.000Z',
        user: {
          id: 'user-1',
          displayName: 'Alex Rivers',
          email: 'alex.rivers@example.com',
          avatarUrl: null,
        },
      },
      {
        id: 'att-2',
        eventId: 'mob-ev-1',
        userId: 'user-2',
        responseStatus: 'PENDING',
        isOrganizer: false,
        respondedAt: null,
        createdAt: '2026-09-14T10:00:00.000Z',
        updatedAt: '2026-09-14T10:00:00.000Z',
        user: {
          id: 'user-2',
          displayName: 'Sarah Chen',
          email: 'sarah.chen@example.com',
          avatarUrl: null,
        },
      },
    ],
    meeting: {
      id: 'meet-1',
      title: 'Sprint Planning',
      status: 'scheduled',
    },
  },
  {
    id: 'mob-ev-2',
    organizationId: 'org-1',
    teamId: null,
    organizerUserId: 'user-2',
    title: '1:1 Sync: Product Roadmap',
    description: 'Quarterly review of calendar, messaging and voice capabilities.',
    location: 'Remote Link',
    startAt: '2026-09-15T14:30:00.000Z',
    endAt: '2026-09-15T15:00:00.000Z',
    timezone: 'UTC',
    allDay: false,
    visibility: 'PRIVATE',
    status: 'confirmed',
    meetingId: null,
    recurrenceRule: null,
    recurrenceUntil: null,
    recurrenceTimezone: null,
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
    deletedAt: null,
    organizer: {
      id: 'user-2',
      displayName: 'Sarah Chen',
      email: 'sarah.chen@example.com',
      avatarUrl: null,
    },
    attendees: [],
    meeting: null,
  },
];

export function MobileCalendarScreen({
  events = SAMPLE_EVENTS,
  onRsvp,
  onJoinMeeting,
  onClose,
}: MobileCalendarScreenProps) {
  const [selectedDate, setSelectedDate] = useState('2026-09-15');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventWithDetails | null>(null);

  // Generate 7-day strip around Sept 15, 2026
  const dateStrip = [
    { dayName: 'Sun', dateNumber: '13', fullDate: '2026-09-13' },
    { dayName: 'Mon', dateNumber: '14', fullDate: '2026-09-14' },
    { dayName: 'Tue', dateNumber: '15', fullDate: '2026-09-15' },
    { dayName: 'Wed', dateNumber: '16', fullDate: '2026-09-16' },
    { dayName: 'Thu', dateNumber: '17', fullDate: '2026-09-17' },
    { dayName: 'Fri', dateNumber: '18', fullDate: '2026-09-18' },
    { dayName: 'Sat', dateNumber: '19', fullDate: '2026-09-19' },
  ];

  const filteredEvents = events.filter((ev) => {
    return ev.startAt.startsWith(selectedDate);
  });

  const handleRsvpPress = async (status: CalendarAttendeeResponseStatus) => {
    if (!selectedEvent) return;
    if (onRsvp) {
      await onRsvp(selectedEvent.id, status);
    }
    setSelectedEvent(null);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Done</Text>
        </TouchableOpacity>
      </View>

      {/* Date Strip */}
      <View style={styles.dateStripContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>
          {dateStrip.map((item) => {
            const isSelected = item.fullDate === selectedDate;
            return (
              <TouchableOpacity
                key={item.fullDate}
                onPress={() => setSelectedDate(item.fullDate)}
                style={[styles.datePill, isSelected && styles.datePillSelected]}
              >
                <Text style={[styles.datePillDay, isSelected && styles.datePillDaySelected]}>
                  {item.dayName}
                </Text>
                <Text style={[styles.datePillNum, isSelected && styles.datePillNumSelected]}>
                  {item.dateNumber}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Events List */}
      <FlatList
        data={filteredEvents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyTitle}>No events on this day</Text>
            <Text style={styles.emptySubtitle}>Select another date to view scheduled events.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const startDate = new Date(item.startAt);
          const endDate = new Date(item.endAt);
          const timeLabel = `${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

          return (
            <TouchableOpacity
              style={styles.eventCard}
              onPress={() => setSelectedEvent(item)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.timeText}>{timeLabel}</Text>
                <View
                  style={[
                    styles.visBadge,
                    item.visibility === 'PRIVATE' ? styles.visPrivate : styles.visOrg,
                  ]}
                >
                  <Text
                    style={[
                      styles.visBadgeText,
                      item.visibility === 'PRIVATE' ? styles.visPrivateText : styles.visOrgText,
                    ]}
                  >
                    {item.visibility}
                  </Text>
                </View>
              </View>

              <Text style={styles.eventTitle}>{item.title}</Text>

              {item.location && (
                <Text style={styles.locationText}>📍 {item.location}</Text>
              )}

              <View style={styles.cardFooter}>
                <Text style={styles.organizerText}>By {item.organizer.displayName}</Text>
                {item.meeting && (
                  <TouchableOpacity
                    style={styles.joinBtn}
                    onPress={() => onJoinMeeting && onJoinMeeting(item.meeting!.id)}
                  >
                    <Text style={styles.joinBtnText}>Join</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Event Details Modal */}
      {selectedEvent && (
        <Modal
          visible={true}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setSelectedEvent(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{selectedEvent.title}</Text>
                <TouchableOpacity onPress={() => setSelectedEvent(null)}>
                  <Text style={styles.modalCloseIcon}>&times;</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                <Text style={styles.modalInfoText}>
                  🕒 {new Date(selectedEvent.startAt).toLocaleString()} - {new Date(selectedEvent.endAt).toLocaleTimeString()}
                </Text>
                {selectedEvent.location && (
                  <Text style={styles.modalInfoText}>📍 {selectedEvent.location}</Text>
                )}
                <Text style={styles.modalInfoText}>
                  👤 Organizer: {selectedEvent.organizer.displayName}
                </Text>

                {selectedEvent.description && (
                  <View style={styles.modalDescBox}>
                    <Text style={styles.modalDescText}>{selectedEvent.description}</Text>
                  </View>
                )}

                {selectedEvent.attendees.length > 0 && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={styles.attendeesHeader}>
                      Attendees ({selectedEvent.attendees.length})
                    </Text>
                    {selectedEvent.attendees.map((att) => (
                      <View key={att.id} style={styles.attendeeRow}>
                        <Text style={styles.attendeeName}>{att.user.displayName}</Text>
                        <Text style={styles.attendeeStatus}>{att.responseStatus}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>

              {/* RSVP Action Bar */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.rsvpBtn, styles.rsvpAccept]}
                  onPress={() => handleRsvpPress('ACCEPTED')}
                >
                  <Text style={styles.rsvpAcceptText}>Accept</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.rsvpBtn, styles.rsvpTentative]}
                  onPress={() => handleRsvpPress('TENTATIVE')}
                >
                  <Text style={styles.rsvpTentativeText}>Tentative</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.rsvpBtn, styles.rsvpDecline]}
                  onPress={() => handleRsvpPress('DECLINED')}
                >
                  <Text style={styles.rsvpDeclineText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.15)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
  },
  closeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#60a5fa',
  },
  dateStripContainer: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.1)',
  },
  dateStrip: {
    paddingHorizontal: 12,
    gap: 8,
  },
  datePill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    minWidth: 48,
  },
  datePillSelected: {
    backgroundColor: '#2563eb',
  },
  datePillDay: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 2,
    fontWeight: '500',
  },
  datePillDaySelected: {
    color: '#ffffff',
  },
  datePillNum: {
    fontSize: 15,
    color: '#f8fafc',
    fontWeight: '700',
  },
  datePillNumSelected: {
    color: '#ffffff',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  eventCard: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#60a5fa',
  },
  visBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  visOrg: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  visPrivate: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  visBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  visOrgText: {
    color: '#60a5fa',
  },
  visPrivateText: {
    color: '#f87171',
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  locationText: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  organizerText: {
    fontSize: 12,
    color: '#64748b',
  },
  joinBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  joinBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    flex: 1,
  },
  modalCloseIcon: {
    fontSize: 24,
    color: '#94a3b8',
    marginLeft: 12,
  },
  modalBody: {
    marginBottom: 16,
  },
  modalInfoText: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 6,
  },
  modalDescBox: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  modalDescText: {
    fontSize: 13,
    color: '#cbd5e1',
  },
  attendeesHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 6,
  },
  attendeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  attendeeName: {
    fontSize: 13,
    color: '#f8fafc',
  },
  attendeeStatus: {
    fontSize: 11,
    color: '#4ade80',
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.15)',
    paddingTop: 12,
  },
  rsvpBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  rsvpAccept: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  rsvpAcceptText: {
    color: '#4ade80',
    fontWeight: '600',
    fontSize: 13,
  },
  rsvpTentative: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
  },
  rsvpTentativeText: {
    color: '#facc15',
    fontWeight: '600',
    fontSize: 13,
  },
  rsvpDecline: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  rsvpDeclineText: {
    color: '#f87171',
    fontWeight: '600',
    fontSize: 13,
  },
});
