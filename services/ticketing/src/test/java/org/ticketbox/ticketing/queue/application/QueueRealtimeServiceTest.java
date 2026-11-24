package org.ticketbox.ticketing.queue.application;

import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.ticketbox.ticketing.queue.application.dto.QueueSnapshotResponse;
import org.ticketbox.ticketing.queue.application.dto.QueueStatusResponse;
import org.ticketbox.ticketing.queue.domain.QueueStatus;

import java.time.OffsetDateTime;
import java.util.UUID;

class QueueRealtimeServiceTest {
    @Test
    void adaptiveSubscriptionsRequireLiveRankAndRecoverAGrantDuringRegistration() {
        var waiting = mock(WaitingRoomService.class);
        var messages = mock(SimpMessagingTemplate.class);
        var realtime = new QueueRealtimeService(waiting, messages);
        ReflectionTestUtils.setField(realtime, "adaptiveEnabled", true);
        UUID concert = UUID.randomUUID();
        UUID far = UUID.randomUUID();
        UUID justGranted = UUID.randomUUID();
        UUID near = UUID.randomUUID();
        var farStatus = status(QueueStatus.WAITING, 1001);
        var nearStatus = status(QueueStatus.WAITING, 1000);
        var admitted = status(QueueStatus.ADMITTED, null);
        when(waiting.status(concert, far)).thenReturn(farStatus);
        when(waiting.status(concert, near)).thenReturn(nearStatus);
        when(waiting.internalStatus(concert, near)).thenReturn(nearStatus);
        when(waiting.status(concert, justGranted)).thenReturn(admitted);
        realtime.subscribe("far", far, concert);
        realtime.subscribe("admitted", justGranted, concert);
        realtime.subscribe("near", near, concert);
        verify(messages, never()).convertAndSendToUser(eq(far.toString()), anyString(),
                any(), anyMap());
        verify(messages).convertAndSendToUser(eq(justGranted.toString()), anyString(),
                eq(admitted), anyMap());
        verify(messages).convertAndSendToUser(eq(near.toString()), anyString(), eq(nearStatus), anyMap());
        clearInvocations(waiting, messages);
        when(waiting.internalStatus(concert, near)).thenReturn(admitted);
        realtime.onAdmissionHint(concert, far);
        realtime.onAdmissionHint(concert, justGranted);
        realtime.onAdmissionHint(concert, near);
        verify(waiting, never()).internalStatus(concert, far);
        verify(waiting, never()).internalStatus(concert, justGranted);
        verify(messages).convertAndSendToUser(eq(near.toString()), anyString(), eq(admitted), anyMap());

        UUID raced = UUID.randomUUID();
        when(waiting.status(concert, raced)).thenReturn(nearStatus);
        when(waiting.internalStatus(concert, raced)).thenReturn(admitted);
        realtime.subscribe("raced", raced, concert);
        verify(messages).convertAndSendToUser(eq(raced.toString()), anyString(), eq(admitted), anyMap());
        clearInvocations(waiting);
        realtime.onAdmissionHint(concert, raced);
        verifyNoInteractions(waiting);
    }

    private QueueStatusResponse status(QueueStatus state, Integer position) {
        return new QueueStatusResponse(state, position, null, null, null, null, 0L, 0L, 0L);
    }

    @Test
    void admissionHintsOnlyReadLocalAudienceAndLastDisconnectRemovesItsIndex() {
        var waiting = mock(WaitingRoomService.class);
        var messages = mock(SimpMessagingTemplate.class);
        var realtime = new QueueRealtimeService(waiting, messages);
        var concert = UUID.randomUUID();
        var user = UUID.randomUUID();
        realtime.subscribe("one", user, concert);
        realtime.subscribe("two", user, concert);
        clearInvocations(waiting, messages);
        realtime.onAdmissionHint(concert, UUID.randomUUID());
        verifyNoInteractions(waiting, messages);
        var disconnected = mock(SessionDisconnectEvent.class);
        when(disconnected.getSessionId()).thenReturn("one");
        realtime.handleDisconnect(disconnected.getSessionId());
        realtime.onAdmissionHint(concert, user);
        verify(waiting, times(1)).internalStatus(concert, user);
        when(disconnected.getSessionId()).thenReturn("two");
        realtime.handleDisconnect(disconnected.getSessionId());
        clearInvocations(waiting, messages);
        realtime.onAdmissionHint(concert, user);
        verifyNoInteractions(waiting, messages);
    }

    @Test
    void updatesOneConcertInsteadOfEverySubscriberAndDisconnectDoesNotLeaveQueue() {
        var waiting = mock(WaitingRoomService.class);
        var messages = mock(SimpMessagingTemplate.class);
        var realtime = new QueueRealtimeService(waiting, messages);
        ReflectionTestUtils.setField(realtime, "snapshotIntervalMs", 10000L);
        UUID concert = UUID.randomUUID();
        when(waiting.snapshot(concert))
                .thenReturn(new QueueSnapshotResponse(concert, 0, 100, 1, OffsetDateTime.now()));
        for (int index = 0; index < 100; index++)
            realtime.subscribe("session-" + index, UUID.randomUUID(), concert);
        clearInvocations(waiting, messages);
        realtime.publishUpdates();
        verify(waiting, never()).promoteWaitingUsers(concert);
        verify(waiting, times(1)).snapshot(concert);
        verify(waiting, never()).internalStatus(any(), any());
        var disconnect = mock(SessionDisconnectEvent.class);
        when(disconnect.getSessionId()).thenReturn("session-0");
        realtime.handleDisconnect(disconnect.getSessionId());
        verify(waiting, never()).leave(any(), any());
    }
}
