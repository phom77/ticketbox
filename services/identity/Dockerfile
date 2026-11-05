FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
COPY backend backend
COPY services services
RUN --mount=type=cache,target=/root/.m2 mvn -B -ntp -pl services/identity -am package -DskipTests
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN mkdir /app/data && chown 10001 /app/data
COPY --from=build /workspace/services/identity/target/identity-service-0.0.1-SNAPSHOT.jar app.jar
USER 10001
EXPOSE 8080
ENTRYPOINT ["java","-jar","app.jar"]
