package com.ticketbox.module.queue.application;

import com.ticketbox.module.queue.web.dto.QueueSnapshotResponse;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import static org.mockito.Mockito.*;

class QueueRealtimeServiceTest {
    @Test
    void admissionHintsOnlyReadLocalAudienceAndLastDisconnectRemovesItsIndex() {
        var waiting=mock(WaitingRoomService.class); var messages=mock(SimpMessagingTemplate.class);
        var realtime=new QueueRealtimeService(waiting,messages); var concert=UUID.randomUUID(); var user=UUID.randomUUID();
        realtime.subscribe("one",user,concert); realtime.subscribe("two",user,concert);
        clearInvocations(waiting,messages);
        realtime.onAdmissionHint(concert,UUID.randomUUID()); verifyNoInteractions(waiting,messages);
        var disconnected=mock(SessionDisconnectEvent.class); when(disconnected.getSessionId()).thenReturn("one");
        realtime.handleDisconnect(disconnected); realtime.onAdmissionHint(concert,user);
        verify(waiting,times(1)).internalStatus(concert,user);
        when(disconnected.getSessionId()).thenReturn("two"); realtime.handleDisconnect(disconnected);
        clearInvocations(waiting,messages); realtime.onAdmissionHint(concert,user); verifyNoInteractions(waiting,messages);
    }
    @Test
    void updatesOneConcertInsteadOfEverySubscriberAndDisconnectDoesNotLeaveQueue() {
        var waiting = mock(WaitingRoomService.class);
        var messages = mock(SimpMessagingTemplate.class);
        var realtime = new QueueRealtimeService(waiting, messages);
        ReflectionTestUtils.setField(realtime, "snapshotIntervalMs", 10000L);
        UUID concert = UUID.randomUUID();
        when(waiting.snapshot(concert)).thenReturn(new QueueSnapshotResponse(concert, 0, 100, 1, OffsetDateTime.now()));
        for (int index = 0; index < 100; index++) realtime.subscribe("session-" + index, UUID.randomUUID(), concert);
        clearInvocations(waiting, messages);
        realtime.publishUpdates();
        verify(waiting, never()).promoteWaitingUsers(concert);
        verify(waiting, times(1)).snapshot(concert);
        verify(waiting, never()).internalStatus(any(), any());
        var disconnect = mock(SessionDisconnectEvent.class);
        when(disconnect.getSessionId()).thenReturn("session-0");
        realtime.handleDisconnect(disconnect);
        verify(waiting, never()).leave(any(), any());
    }
}
