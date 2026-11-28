package org.ticketbox.catalog.classification.application;

import java.util.List;
import org.springframework.stereotype.Service;
import org.ticketbox.catalog.classification.domain.ClassificationReference;
import org.ticketbox.catalog.classification.domain.ClassificationReference.Segment;

/**
 * The classification reference data. It changes only through Catalog migrations, so it is loaded once per process and
 * kept in memory.
 */
@Service
public class ClassificationQuery {
    private final ClassificationStore store;
    private volatile ClassificationReference cached;

    public ClassificationQuery(ClassificationStore store) {
        this.store = store;
    }

    /** Every segment and genre, active or not, for validating existing and new assignments. */
    public ClassificationReference reference() {
        var value = cached;
        if (value == null) {
            value = store.load();
            cached = value;
        }
        return value;
    }

    /** The active segments and genres in display order. */
    public List<Segment> active() {
        return reference().active();
    }
}
