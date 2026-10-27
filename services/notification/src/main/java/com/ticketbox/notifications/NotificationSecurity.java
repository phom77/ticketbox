package com.ticketbox.notifications;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@Configuration
public class NotificationSecurity {
 @Bean SecurityFilterChain security(HttpSecurity http,@Value("${notification.jwt-secret}") String secret) throws Exception {
  if(secret.length()<64) throw new IllegalStateException("JWT secret must be at least 64 characters");
  var key=Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
  var jwt=new OncePerRequestFilter() {
   @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
    String header=request.getHeader("Authorization");
    if(header!=null && header.startsWith("Bearer ")) try {
     var claims=Jwts.parser().verifyWith(key).build().parseSignedClaims(header.substring(7)).getPayload();
     UUID user=UUID.fromString(claims.getSubject());String role=claims.get("role",String.class);
     if(claims.getExpiration()!=null && List.of("AUDIENCE","STAFF","ORGANIZER","ADMIN").contains(role))
      SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user.toString(),null,List.of(new SimpleGrantedAuthority("ROLE_"+role))));
    } catch(RuntimeException ignored) { SecurityContextHolder.clearContext(); }
    chain.doFilter(request,response);
   }
  };
  return http.csrf(c->c.disable()).sessionManagement(c->c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
    .authorizeHttpRequests(c->c.requestMatchers("/actuator/health/**").permitAll()
      .requestMatchers("/api/admin/notifications/**","/actuator/**").hasRole("ADMIN")
      .requestMatchers("/api/notifications/**").authenticated().anyRequest().denyAll())
    .exceptionHandling(c->c.authenticationEntryPoint((q,r,e)->{r.setStatus(401);r.setContentType("application/json");r.getWriter().write("{\"code\":401,\"message\":\"Authentication required\"}");})
      .accessDeniedHandler((q,r,e)->{r.setStatus(403);r.setContentType("application/json");r.getWriter().write("{\"code\":403,\"message\":\"Access denied\"}");}))
    .addFilterBefore(jwt,UsernamePasswordAuthenticationFilter.class).build();
 }
}
