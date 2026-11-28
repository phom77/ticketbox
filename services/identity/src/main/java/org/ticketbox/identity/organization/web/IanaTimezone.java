package org.ticketbox.identity.organization.web;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.time.ZoneId;

@Documented
@Constraint(validatedBy = IanaTimezone.Validator.class)
@Target({ElementType.RECORD_COMPONENT, ElementType.FIELD, ElementType.METHOD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@interface IanaTimezone {
    String message() default "{validation.profile.timezone.invalid}";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<IanaTimezone, String> {
        @Override
        public boolean isValid(String value, ConstraintValidatorContext context) {
            return value != null && ZoneId.getAvailableZoneIds().contains(value.strip())
                    && (value.contains("/") || value.strip().equals("UTC"));
        }
    }
}
