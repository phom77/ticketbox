package org.ticketbox.ticketing.persistence;

import java.lang.annotation.*;

/** Opts an eventually consistent query into the lab read replica. */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface ReplicaRead {}
