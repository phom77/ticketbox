package org.ticketbox.identity.infrastructure.integration;

import org.flywaydb.core.api.callback.Callback;
import org.flywaydb.core.api.callback.Context;
import org.flywaydb.core.api.callback.Event;
import org.springframework.stereotype.Component;

import java.sql.SQLException;

@Component
class CutoverFence implements Callback {
    @Override
    public boolean supports(Event event, Context context) {
        return event == Event.AFTER_MIGRATE;
    }

    @Override
    public boolean canHandleInTransaction(Event event, Context context) {
        return true;
    }

    @Override
    public String getCallbackName() {
        return "split-cutover-fence";
    }

    @Override
    public void handle(Event event, Context context) {
        try (var statement = context.getConnection().createStatement();
                var rows =
                        statement.executeQuery(
                                "SELECT count(*) FROM split_cutover_marker WHERE NOT ready")) {
            rows.next();
            if (rows.getLong(1) > 0) {
                throw new IllegalStateException(
                        "Service data cutover is incomplete; consult the migration manifest");
            }
        } catch (SQLException failure) {
            throw new IllegalStateException("Cannot verify data ownership", failure);
        }
    }
}
