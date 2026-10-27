package com.ticketbox.payments;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.context.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

@Configuration
class PaymentSecurity {
 @Bean SecurityFilterChain security(HttpSecurity http,@Value("${payment.service-token}")String secret)throws Exception {
  if(secret.length()<32)throw new IllegalStateException("Payment token must be at least 32 characters");
  byte[] token=secret.getBytes(StandardCharsets.UTF_8);
  var filter=new OncePerRequestFilter(){
   protected void doFilterInternal(HttpServletRequest q,HttpServletResponse r,FilterChain chain)throws IOException,ServletException {
    var supplied=q.getHeader("X-Service-Token");
    if(supplied!=null && MessageDigest.isEqual(token,supplied.getBytes(StandardCharsets.UTF_8)))
     SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("core",null,List.of()));
    chain.doFilter(q,r);
   }
  };
  return http.csrf(c->c.disable()).sessionManagement(c->c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
   .authorizeHttpRequests(c->c.requestMatchers("/actuator/health/**","/api/payments/webhooks/**").permitAll()
    .requestMatchers("/internal/**","/actuator/**").authenticated().anyRequest().denyAll())
   .exceptionHandling(c->c.authenticationEntryPoint((q,r,e)->r.setStatus(401)).accessDeniedHandler((q,r,e)->r.setStatus(403)))
   .addFilterBefore(filter,UsernamePasswordAuthenticationFilter.class).build();
 }
}
