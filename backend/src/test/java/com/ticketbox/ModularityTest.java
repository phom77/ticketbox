package com.ticketbox;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

/**
 * Architecture test to verify Spring Modulith module boundaries.
 *
 * <p>This test ensures that:
 * <ul>
 *   <li>No module directly accesses internal packages of another module</li>
 *   <li>Only public types from a module's root package are accessible to others</li>
 *   <li>Module dependencies align with the declared architecture</li>
 * </ul>
 *
 * <p>Run this test after any structural refactoring to catch boundary violations early.
 */
class ModularityTest {

    private static final ApplicationModules modules =
            ApplicationModules.of(TicketBoxApplication.class);

    @Test
    void modulesShouldBeCompliant() {
        modules.verify();
    }
}
