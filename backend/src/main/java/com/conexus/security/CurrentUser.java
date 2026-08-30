package com.conexus.security;

import java.lang.annotation.*;

/**
 * Injects the authenticated caller's user id into a controller method.
 *
 * Endpoints must take the acting user from here rather than from a ?userId=
 * query parameter — a client-supplied id can be changed to anyone else's.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface CurrentUser {
}
