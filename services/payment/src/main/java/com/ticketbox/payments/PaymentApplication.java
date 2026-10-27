package com.ticketbox.payments;
import com.ticketbox.payments.provider.*;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;
@SpringBootApplication @EnableScheduling
@EnableConfigurationProperties({MomoProperties.class,VnpayProperties.class})
public class PaymentApplication {public static void main(String[] args){SpringApplication.run(PaymentApplication.class,args);}}
