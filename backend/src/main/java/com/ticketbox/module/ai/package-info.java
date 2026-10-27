/**
 * AI support module.
 *
 * <p>Processes uploaded PDFs into artist biography drafts using a configurable AI
 * provider. Jobs support retries and recovery; organizers review and apply drafts
 * to concerts through the Concert module's public port.
 */
@org.springframework.modulith.ApplicationModule(allowedDependencies = {"concert", "shared"})
package com.ticketbox.module.ai;
