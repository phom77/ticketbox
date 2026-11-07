package org.ticketbox.ticketing.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

import org.junit.jupiter.api.Test;

class ArchitectureTest {
    private final JavaClasses classes =
            new ClassFileImporter()
                    .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                    .importPackages("org.ticketbox.ticketing");

    @Test
    void domainIsIndependentOfFrameworksAndOuterLayers() {
        noClasses()
                .that()
                .resideInAPackage("..domain..")
                .should()
                .dependOnClassesThat()
                .resideInAnyPackage(
                        "org.springframework..",
                        "jakarta.persistence..",
                        "com.fasterxml.jackson..",
                        "org.hibernate..",
                        "..application..",
                        "..infrastructure..",
                        "..web..",
                        "..config..")
                .check(classes);
    }

    @Test
    void useCasesDependOnPortsInsteadOfAdapters() {
        noClasses()
                .that()
                .resideInAPackage("..application..")
                .should()
                .dependOnClassesThat()
                .resideInAnyPackage(
                        "..infrastructure..",
                        "..web..",
                        "..config..",
                        "org.springframework.web..",
                        "org.springframework.jdbc..",
                        "org.springframework.data.jpa..",
                        "org.springframework.data.redis..",
                        "jakarta.persistence..")
                .check(classes);
    }

    @Test
    void controllersUseApplicationInterfaces() {
        noClasses()
                .that()
                .areAnnotatedWith(org.springframework.web.bind.annotation.RestController.class)
                .should()
                .dependOnClassesThat()
                .resideInAnyPackage(
                        "..infrastructure..",
                        "org.springframework.jdbc..",
                        "org.springframework.data.redis..")
                .check(classes);
    }

    @Test
    void useCasesChangeOrderStateThroughItsDomainOperations() {
        noClasses()
                .that()
                .resideInAPackage("..application..")
                .should()
                .callMethod(
                        org.ticketbox.ticketing.order.domain.Order.class,
                        "setStatus",
                        org.ticketbox.ticketing.order.domain.Order.Status.class)
                .check(classes);
    }
}
