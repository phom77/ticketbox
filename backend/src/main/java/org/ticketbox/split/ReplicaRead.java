package org.ticketbox.split;

import java.lang.annotation.*;

/** Opts an eventually consistent query into the lab read replica. */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface ReplicaRead {}
