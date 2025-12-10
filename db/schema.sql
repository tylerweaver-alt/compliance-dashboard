--
-- PostgreSQL database dump
--

\restrict TDOaHfB7YDr1cA4rXgczHvO5xpi6Eb7vDKhysmwwhmAJiFya9jEFsJyvPnSOrKu

-- Dumped from database version 17.7 (178558d)
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: neon_auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA neon_auth;


--
-- Name: topology; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA topology;


--
-- Name: SCHEMA topology; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA topology IS 'PostGIS Topology schema';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: postgis_raster; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_raster WITH SCHEMA public;


--
-- Name: EXTENSION postgis_raster; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis_raster IS 'PostGIS raster types and functions';


--
-- Name: postgis_topology; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_topology WITH SCHEMA topology;


--
-- Name: EXTENSION postgis_topology; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis_topology IS 'PostGIS topology spatial types and functions';


--
-- Name: boundary_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.boundary_role_enum AS ENUM (
    'official',
    'external',
    'nexus_visual'
);


--
-- Name: apply_weather_auto_exclusions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_weather_auto_exclusions() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_rows INTEGER := 0;
BEGIN
  -- 1) Find calls that match weather alerts, are not yet auto-excluded, AND are out of compliance
  -- CRITICAL: Only out-of-compliance (red) calls can be weather auto-excluded
  WITH candidates AS (
    SELECT
      cwm.call_id,
      cwm.weather_event_id,
      cwm.weather_event_type,
      cwm.weather_severity,
      cwm.weather_area_desc,
      cwm.overlap_start,
      cwm.overlap_end
    FROM call_weather_matches cwm
    JOIN calls c ON c.id = cwm.call_id
    WHERE COALESCE(c.is_auto_excluded, FALSE) = FALSE
      -- ONLY exclude calls that are OUT OF COMPLIANCE (red calls)
      AND cwm.is_out_of_compliance = TRUE
  ),

  -- 2) Insert audit rows (idempotent via UNIQUE index + ON CONFLICT)
  inserted AS (
    INSERT INTO call_weather_exclusion_audit (
      call_id,
      weather_event_id,
      exclusion_strategy,
      exclusion_reason,
      overlap_start,
      overlap_end,
      weather_event_type,
      weather_severity,
      weather_area_desc,
      extra
    )
    SELECT
      call_id,
      weather_event_id,
      'NWS_WEATHER_ALERT' AS exclusion_strategy,
      'Out-of-compliance call excluded due to NWS weather alert active during response' AS exclusion_reason,
      overlap_start,
      overlap_end,
      weather_event_type,
      weather_severity,
      weather_area_desc,
      jsonb_build_object(
        'weather_event_id', weather_event_id,
        'weather_event_type', weather_event_type,
        'weather_severity', weather_severity,
        'weather_area_desc', weather_area_desc,
        'overlap_start', overlap_start,
        'overlap_end', overlap_end
      )
    FROM candidates
    ON CONFLICT (call_id, weather_event_id, exclusion_strategy) DO NOTHING
    RETURNING call_id
  )

  -- 3) Update calls table to mark those calls as auto-excluded
  UPDATE calls c
  SET
    is_auto_excluded        = TRUE,
    auto_exclusion_strategy = 'NWS_WEATHER_ALERT',
    auto_exclusion_reason   = 'Out-of-compliance call excluded due to NWS weather alert active during response',
    auto_excluded_at        = now(),
    auto_exclusion_metadata =
      COALESCE(c.auto_exclusion_metadata, '{}'::jsonb)
      || jsonb_build_object(
           'weather_exclusion', jsonb_build_object(
             'strategy', 'NWS_WEATHER_ALERT',
             'last_applied_at', now(),
             'reason', 'Only out-of-compliance calls are eligible for weather auto-exclusion'
           )
         )
  WHERE c.id IN (SELECT call_id FROM inserted);

  -- how many calls were updated this run
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN v_rows;
END;
$$;


--
-- Name: get_jurisdictions_for_point(double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_jurisdictions_for_point(in_lat double precision, in_lon double precision) RETURNS TABLE(jurisdiction_id integer, jurisdiction_name text, jurisdiction_type text, boundary_role public.boundary_role_enum, source_name text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.name,
    jt.code AS jurisdiction_type,
    jb.boundary_role,
    s.name AS source_name
  FROM jurisdiction_boundaries jb
  JOIN jurisdictions j      ON jb.jurisdiction_id = j.id
  JOIN jurisdiction_types jt ON j.type_id = jt.id
  JOIN boundary_sources s   ON jb.source_id = s.id
  WHERE ST_Contains(
    jb.geom,
    ST_SetSRID(ST_MakePoint(in_lon, in_lat), 4326)
  );
END;
$$;


--
-- Name: get_official_jurisdictions_for_point(double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_official_jurisdictions_for_point(in_lat double precision, in_lon double precision) RETURNS TABLE(jurisdiction_id integer, jurisdiction_name text, jurisdiction_type text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.name,
    jt.code AS jurisdiction_type
  FROM jurisdiction_boundaries jb
  JOIN jurisdictions j       ON jb.jurisdiction_id = j.id
  JOIN jurisdiction_types jt ON j.type_id = jt.id
  WHERE jb.boundary_role = 'official'
    AND ST_Contains(
      jb.geom,
      ST_SetSRID(ST_MakePoint(in_lon, in_lat), 4326)
    );
END;
$$;


--
-- Name: parse_duration_to_seconds(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.parse_duration_to_seconds(input text) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
    DECLARE
      parts text[];
      h numeric;
      m numeric;
      s numeric;
    BEGIN
      IF input IS NULL OR trim(input) = '' THEN
        RETURN NULL;
      END IF;
      
      parts := string_to_array(trim(input), ':');
      
      IF array_length(parts, 1) = 3 THEN
        h := parts[1]::numeric;
        m := parts[2]::numeric;
        s := parts[3]::numeric;
        RETURN h * 3600 + m * 60 + s;
      ELSIF array_length(parts, 1) = 2 THEN
        m := parts[1]::numeric;
        s := parts[2]::numeric;
        RETURN m * 60 + s;
      ELSIF array_length(parts, 1) = 1 THEN
        RETURN parts[1]::numeric;
      ELSE
        RETURN NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $$;


--
-- Name: safe_timestamptz(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.safe_timestamptz(text) RETURNS timestamp with time zone
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
    BEGIN
      RETURN $1::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    $_$;


--
-- Name: set_updated_at_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: users_sync; Type: TABLE; Schema: neon_auth; Owner: -
--

CREATE TABLE neon_auth.users_sync (
    raw_json jsonb NOT NULL,
    id text GENERATED ALWAYS AS ((raw_json ->> 'id'::text)) STORED NOT NULL,
    name text GENERATED ALWAYS AS ((raw_json ->> 'display_name'::text)) STORED,
    email text GENERATED ALWAYS AS ((raw_json ->> 'primary_email'::text)) STORED,
    created_at timestamp with time zone GENERATED ALWAYS AS (to_timestamp((trunc((((raw_json ->> 'signed_up_at_millis'::text))::bigint)::double precision) / (1000)::double precision))) STORED,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_email text,
    actor_role text,
    category text NOT NULL,
    action text NOT NULL,
    target_email text,
    target_id uuid,
    details jsonb
);


--
-- Name: auto_exclusion_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_exclusion_configs (
    id integer NOT NULL,
    region_id integer,
    strategy_key character varying(50) NOT NULL,
    is_enabled boolean DEFAULT true,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id uuid
);


--
-- Name: auto_exclusion_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auto_exclusion_configs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auto_exclusion_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auto_exclusion_configs_id_seq OWNED BY public.auto_exclusion_configs.id;


--
-- Name: auto_exclusions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_exclusions (
    id bigint NOT NULL,
    call_id bigint NOT NULL,
    exclusion_type text NOT NULL,
    reason text,
    strategy_key text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: auto_exclusions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auto_exclusions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auto_exclusions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auto_exclusions_id_seq OWNED BY public.auto_exclusions.id;


--
-- Name: boundary_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boundary_sources (
    id integer NOT NULL,
    name text NOT NULL,
    description text,
    is_official boolean DEFAULT false
);


--
-- Name: boundary_sources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.boundary_sources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: boundary_sources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.boundary_sources_id_seq OWNED BY public.boundary_sources.id;


--
-- Name: call_exclusion_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_exclusion_audit (
    id bigint NOT NULL,
    call_id bigint NOT NULL,
    exclusion_type text NOT NULL,
    auto_applied boolean DEFAULT true NOT NULL,
    weather_event_id bigint,
    weather_nws_id text,
    weather_event_name text,
    queue_response_time_ms integer,
    compliance_threshold_ms integer,
    call_in_queue_time timestamp with time zone,
    on_scene_time timestamp with time zone,
    call_lat double precision,
    call_lon double precision,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: call_exclusion_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.call_exclusion_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: call_exclusion_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.call_exclusion_audit_id_seq OWNED BY public.call_exclusion_audit.id;


--
-- Name: call_weather_exclusion_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_weather_exclusion_audit (
    id bigint NOT NULL,
    call_id bigint NOT NULL,
    weather_event_id bigint NOT NULL,
    exclusion_strategy text NOT NULL,
    exclusion_reason text,
    overlap_start timestamp with time zone,
    overlap_end timestamp with time zone,
    weather_event_type text,
    weather_severity text,
    weather_area_desc text,
    extra jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: call_weather_exclusion_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.call_weather_exclusion_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: call_weather_exclusion_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.call_weather_exclusion_audit_id_seq OWNED BY public.call_weather_exclusion_audit.id;


--
-- Name: calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calls (
    id bigint NOT NULL,
    parish_id integer NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_by_user_id uuid,
    response_number text,
    response_date text,
    response_date_time text,
    radio_name text,
    response_area text,
    origin_description text,
    origin_address text,
    origin_location_city text,
    origin_zip text,
    origin_latitude double precision,
    origin_longitude double precision,
    destination_description text,
    destination_address text,
    destination_location_city text,
    destination_zip text,
    caller_type text,
    problem_description text,
    priority text,
    unnamed_col_19 text,
    transport_mode text,
    master_incident_cancel_reason text,
    call_in_que_time text,
    call_taking_complete_time text,
    assigned_time_first_unit text,
    assigned_time text,
    enroute_time text,
    staged_time text,
    arrived_at_scene_time text,
    depart_scene_time text,
    arrived_destination_time text,
    call_cleared_time text,
    master_incident_delay_reason_description text,
    vehicle_assigned_delay_reason text,
    cad_is_transport text,
    queue_response_time text,
    assigned_response_time text,
    enroute_response_time text,
    assigned_to_arrived_at_scene text,
    call_in_queue_to_cleared_call_lag text,
    compliance_time text,
    raw_row jsonb,
    is_excluded boolean DEFAULT false NOT NULL,
    exclusion_reason text,
    is_confirmed boolean DEFAULT false,
    region_id integer,
    geom public.geometry(Point,4326) GENERATED ALWAYS AS (public.st_setsrid(public.st_makepoint(origin_longitude, origin_latitude), 4326)) STORED,
    excluded_at timestamp with time zone,
    excluded_by_user_id uuid,
    is_auto_excluded boolean DEFAULT false,
    auto_exclusion_strategy character varying(50),
    auto_exclusion_reason text,
    auto_excluded_at timestamp with time zone,
    auto_exclusion_metadata jsonb,
    has_time_edits boolean DEFAULT false,
    last_time_edit_at timestamp with time zone,
    needs_human_review boolean DEFAULT false,
    human_review_reason text,
    human_review_flagged_at timestamp with time zone,
    auto_exclusion_evaluated boolean DEFAULT false,
    auto_exclusion_evaluated_at timestamp with time zone,
    compliance_time_minutes numeric(10,4),
    threshold_minutes numeric(10,4) DEFAULT 12,
    exclusion_type character varying(10),
    confirmed_at timestamp with time zone,
    confirmed_by_user_id uuid
);


--
-- Name: call_weather_exclusions_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.call_weather_exclusions_view AS
 SELECT c.id AS call_id,
    c.parish_id,
    c.response_number,
    c.response_date_time,
    c.origin_description,
    c.origin_address,
    c.origin_location_city,
    c.origin_zip,
    c.problem_description,
    c.priority,
    c.is_excluded,
    c.exclusion_reason,
    c.is_auto_excluded,
    c.auto_exclusion_strategy,
    c.auto_exclusion_reason,
    c.auto_excluded_at,
    c.auto_exclusion_metadata,
    a.weather_event_id,
    a.weather_event_type,
    a.weather_severity,
    a.weather_area_desc,
    a.overlap_start,
    a.overlap_end,
    a.created_at AS audit_created_at,
    a.extra AS audit_extra
   FROM (public.calls c
     JOIN public.call_weather_exclusion_audit a ON ((a.call_id = c.id)));


--
-- Name: calls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.calls_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: calls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.calls_id_seq OWNED BY public.calls.id;


--
-- Name: calls_november_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calls_november_backup (
    id bigint,
    parish_id integer,
    uploaded_at timestamp with time zone,
    uploaded_by_user_id uuid,
    response_number text,
    response_date text,
    response_date_time text,
    radio_name text,
    response_area text,
    origin_description text,
    origin_address text,
    origin_location_city text,
    origin_zip text,
    origin_latitude double precision,
    origin_longitude double precision,
    destination_description text,
    destination_address text,
    destination_location_city text,
    destination_zip text,
    caller_type text,
    problem_description text,
    priority text,
    unnamed_col_19 text,
    transport_mode text,
    master_incident_cancel_reason text,
    call_in_que_time text,
    call_taking_complete_time text,
    assigned_time_first_unit text,
    assigned_time text,
    enroute_time text,
    staged_time text,
    arrived_at_scene_time text,
    depart_scene_time text,
    arrived_destination_time text,
    call_cleared_time text,
    master_incident_delay_reason_description text,
    vehicle_assigned_delay_reason text,
    cad_is_transport text,
    queue_response_time text,
    assigned_response_time text,
    enroute_response_time text,
    assigned_to_arrived_at_scene text,
    call_in_queue_to_cleared_call_lag text,
    compliance_time text,
    raw_row jsonb,
    is_excluded boolean,
    exclusion_reason text,
    is_confirmed boolean,
    region_id integer,
    geom public.geometry(Point,4326)
);


--
-- Name: calls_with_times; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.calls_with_times AS
 SELECT id,
    parish_id,
    uploaded_at,
    uploaded_by_user_id,
    response_number,
    response_date,
    response_date_time,
    radio_name,
    response_area,
    origin_description,
    origin_address,
    origin_location_city,
    origin_zip,
    origin_latitude,
    origin_longitude,
    destination_description,
    destination_address,
    destination_location_city,
    destination_zip,
    caller_type,
    problem_description,
    priority,
    unnamed_col_19,
    transport_mode,
    master_incident_cancel_reason,
    call_in_que_time,
    call_taking_complete_time,
    assigned_time_first_unit,
    assigned_time,
    enroute_time,
    staged_time,
    arrived_at_scene_time,
    depart_scene_time,
    arrived_destination_time,
    call_cleared_time,
    master_incident_delay_reason_description,
    vehicle_assigned_delay_reason,
    cad_is_transport,
    queue_response_time,
    assigned_response_time,
    enroute_response_time,
    assigned_to_arrived_at_scene,
    call_in_queue_to_cleared_call_lag,
    compliance_time,
    raw_row,
    is_excluded,
    exclusion_reason,
    is_confirmed,
    region_id,
    geom,
    excluded_at,
    excluded_by_user_id,
    is_auto_excluded,
    auto_exclusion_strategy,
    auto_exclusion_reason,
    auto_excluded_at,
    auto_exclusion_metadata,
    has_time_edits,
    last_time_edit_at,
    COALESCE(call_in_que_time, response_date_time) AS call_start_time,
    COALESCE(arrived_at_scene_time, depart_scene_time, call_cleared_time) AS call_end_time
   FROM public.calls c
  WHERE ((origin_latitude IS NOT NULL) AND (origin_longitude IS NOT NULL) AND (geom IS NOT NULL));


--
-- Name: coverage_level_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coverage_level_posts (
    id integer NOT NULL,
    level_id integer,
    post_id integer
);


--
-- Name: coverage_level_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coverage_level_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coverage_level_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coverage_level_posts_id_seq OWNED BY public.coverage_level_posts.id;


--
-- Name: coverage_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coverage_levels (
    id integer NOT NULL,
    region_id character varying(50) NOT NULL,
    level_number integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    color character varying(20) DEFAULT '#6b7280'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: coverage_levels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coverage_levels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coverage_levels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coverage_levels_id_seq OWNED BY public.coverage_levels.id;


--
-- Name: coverage_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coverage_posts (
    id integer NOT NULL,
    region_id character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    address text,
    intersection text,
    lat numeric(10,6),
    lng numeric(10,6),
    default_units integer DEFAULT 1,
    is_active boolean DEFAULT true,
    coverage_level integer DEFAULT 4,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: coverage_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coverage_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coverage_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coverage_posts_id_seq OWNED BY public.coverage_posts.id;


--
-- Name: deployment_isochrones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deployment_isochrones (
    id integer NOT NULL,
    site_id integer NOT NULL,
    minutes integer NOT NULL,
    geom public.geometry(MultiPolygon,4326) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deployment_isochrones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.deployment_isochrones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: deployment_isochrones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.deployment_isochrones_id_seq OWNED BY public.deployment_isochrones.id;


--
-- Name: deployment_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deployment_sites (
    id integer NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    region text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    geom public.geometry(Point,4326) GENERATED ALWAYS AS (public.st_setsrid(public.st_makepoint(longitude, latitude), 4326)) STORED,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    region_code text,
    parish_id integer,
    address text
);


--
-- Name: deployment_sites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.deployment_sites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: deployment_sites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.deployment_sites_id_seq OWNED BY public.deployment_sites.id;


--
-- Name: exception_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exception_types (
    id integer NOT NULL,
    code text NOT NULL,
    label text NOT NULL
);


--
-- Name: exception_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exception_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exception_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exception_types_id_seq OWNED BY public.exception_types.id;


--
-- Name: exclusion_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exclusion_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    call_id integer NOT NULL,
    exclusion_type character varying(10) NOT NULL,
    strategy_key character varying(50),
    reason text NOT NULL,
    created_by_user_id uuid,
    created_by_email character varying(255),
    engine_metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reverted_at timestamp with time zone,
    reverted_by_user_id uuid,
    reverted_by_email character varying(255),
    revert_reason text,
    CONSTRAINT exclusion_logs_exclusion_type_check CHECK (((exclusion_type)::text = ANY ((ARRAY['AUTO'::character varying, 'MANUAL'::character varying])::text[])))
);


--
-- Name: jurisdiction_boundaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jurisdiction_boundaries (
    id integer NOT NULL,
    jurisdiction_id integer NOT NULL,
    source_id integer NOT NULL,
    boundary_role public.boundary_role_enum NOT NULL,
    geom public.geometry(MultiPolygon,4326) NOT NULL,
    valid_from date,
    valid_to date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: external_boundaries; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.external_boundaries AS
 SELECT id,
    jurisdiction_id,
    source_id,
    boundary_role,
    geom,
    valid_from,
    valid_to,
    created_at,
    updated_at
   FROM public.jurisdiction_boundaries jb
  WHERE (boundary_role = 'external'::public.boundary_role_enum);


--
-- Name: jurisdiction_boundaries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.jurisdiction_boundaries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jurisdiction_boundaries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.jurisdiction_boundaries_id_seq OWNED BY public.jurisdiction_boundaries.id;


--
-- Name: jurisdiction_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jurisdiction_types (
    id integer NOT NULL,
    code text NOT NULL,
    display_name text NOT NULL
);


--
-- Name: jurisdiction_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.jurisdiction_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jurisdiction_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.jurisdiction_types_id_seq OWNED BY public.jurisdiction_types.id;


--
-- Name: jurisdictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jurisdictions (
    id integer NOT NULL,
    type_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    region_code text,
    is_active boolean DEFAULT true
);


--
-- Name: jurisdictions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.jurisdictions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jurisdictions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.jurisdictions_id_seq OWNED BY public.jurisdictions.id;


--
-- Name: manual_exclusions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manual_exclusions (
    id bigint NOT NULL,
    call_id bigint NOT NULL,
    reason text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: manual_exclusions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.manual_exclusions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: manual_exclusions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.manual_exclusions_id_seq OWNED BY public.manual_exclusions.id;


--
-- Name: monthly_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monthly_metrics (
    id integer NOT NULL,
    parish_id integer NOT NULL,
    zone_name text,
    month_key date NOT NULL,
    parish_config_id integer NOT NULL,
    total_calls integer NOT NULL,
    included_calls integer NOT NULL,
    excluded_calls integer NOT NULL,
    on_time_included integer NOT NULL,
    late_included integer NOT NULL,
    compliance_pct numeric NOT NULL,
    avg_response_minutes numeric,
    last_calculated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: monthly_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.monthly_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: monthly_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.monthly_metrics_id_seq OWNED BY public.monthly_metrics.id;


--
-- Name: nexus_visual_boundaries; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.nexus_visual_boundaries AS
 SELECT id,
    jurisdiction_id,
    source_id,
    boundary_role,
    geom,
    valid_from,
    valid_to,
    created_at,
    updated_at
   FROM public.jurisdiction_boundaries jb
  WHERE (boundary_role = 'nexus_visual'::public.boundary_role_enum);


--
-- Name: official_boundaries; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.official_boundaries AS
 SELECT jb.id,
    jb.jurisdiction_id,
    jb.source_id,
    jb.boundary_role,
    jb.geom,
    jb.valid_from,
    jb.valid_to,
    jb.created_at,
    jb.updated_at
   FROM (public.jurisdiction_boundaries jb
     JOIN public.boundary_sources s ON ((jb.source_id = s.id)))
  WHERE (jb.boundary_role = 'official'::public.boundary_role_enum);


--
-- Name: om_parish_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.om_parish_assignments (
    id integer NOT NULL,
    om_user_id uuid NOT NULL,
    parish_id integer NOT NULL
);


--
-- Name: om_parish_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.om_parish_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: om_parish_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.om_parish_assignments_id_seq OWNED BY public.om_parish_assignments.id;


--
-- Name: parish_config_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parish_config_exceptions (
    id integer NOT NULL,
    parish_config_id integer NOT NULL,
    exception_type_id integer NOT NULL,
    can_exclude boolean DEFAULT true NOT NULL
);


--
-- Name: parish_config_exceptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parish_config_exceptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parish_config_exceptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parish_config_exceptions_id_seq OWNED BY public.parish_config_exceptions.id;


--
-- Name: parish_config_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parish_config_zones (
    id integer NOT NULL,
    parish_config_id integer NOT NULL,
    zone_name text NOT NULL,
    target_minutes integer NOT NULL,
    required_pct integer DEFAULT 90 NOT NULL
);


--
-- Name: parish_config_zones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parish_config_zones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parish_config_zones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parish_config_zones_id_seq OWNED BY public.parish_config_zones.id;


--
-- Name: parish_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parish_configs (
    id integer NOT NULL,
    parish_id integer NOT NULL,
    version integer NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    applies_from timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);


--
-- Name: parish_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parish_configs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parish_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parish_configs_id_seq OWNED BY public.parish_configs.id;


--
-- Name: parish_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parish_settings (
    parish_id text NOT NULL,
    compliance_field_ids text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    exception_keywords text[] DEFAULT '{}'::text[],
    global_response_threshold_seconds integer,
    target_average_response_seconds integer,
    use_zones boolean DEFAULT false,
    report_columns text[],
    response_start_time text DEFAULT 'dispatched'::text,
    exclusion_criteria jsonb DEFAULT '{}'::jsonb,
    target_compliance_percent numeric(5,2) DEFAULT 90.0,
    CONSTRAINT chk_target_compliance_percent CHECK (((target_compliance_percent >= (0)::numeric) AND (target_compliance_percent <= (100)::numeric)))
);


--
-- Name: parish_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parish_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parish_id integer NOT NULL,
    filename text NOT NULL,
    file_size_bytes integer NOT NULL,
    file_mime_type text,
    file_data bytea NOT NULL,
    uploaded_by_user_id uuid NOT NULL,
    uploaded_by_username text NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'pending'::text NOT NULL,
    rows_imported integer,
    error_message text,
    data_month integer,
    data_year integer
);


--
-- Name: parishes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parishes (
    id integer NOT NULL,
    name text NOT NULL,
    region text DEFAULT 'Central Louisiana'::text NOT NULL,
    is_contracted boolean DEFAULT false NOT NULL,
    place_type text,
    logo_url text
);


--
-- Name: parish_zone_contract_status; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.parish_zone_contract_status AS
 SELECT m.parish_id,
    p.name AS parish_name,
    pc.id AS parish_config_id,
    pc.version AS config_version,
    m.zone_name,
    m.month_key,
    z.target_minutes,
    z.required_pct,
    m.total_calls,
    m.included_calls,
    m.excluded_calls,
    m.on_time_included,
    m.late_included,
    m.compliance_pct,
        CASE
            WHEN (m.included_calls = 0) THEN 'no_data'::text
            WHEN (m.compliance_pct >= (z.required_pct)::numeric) THEN 'compliant'::text
            WHEN (m.compliance_pct >= ((z.required_pct - 2))::numeric) THEN 'warning'::text
            ELSE 'breach'::text
        END AS contract_status
   FROM (((public.monthly_metrics m
     JOIN public.parish_configs pc ON ((m.parish_config_id = pc.id)))
     JOIN public.parishes p ON ((m.parish_id = p.id)))
     JOIN public.parish_config_zones z ON (((z.parish_config_id = pc.id) AND (z.zone_name = m.zone_name))));


--
-- Name: parishes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parishes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parishes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parishes_id_seq OWNED BY public.parishes.id;


--
-- Name: policy_rule_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_rule_actions (
    id integer NOT NULL,
    rule_id integer,
    action_type character varying(50) NOT NULL,
    target_level integer,
    target_post_id integer,
    from_parish character varying(100),
    to_parish character varying(100),
    message text,
    execution_order integer DEFAULT 1
);


--
-- Name: policy_rule_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.policy_rule_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: policy_rule_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.policy_rule_actions_id_seq OWNED BY public.policy_rule_actions.id;


--
-- Name: policy_rule_conditions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_rule_conditions (
    id integer NOT NULL,
    rule_id integer,
    condition_type character varying(50) NOT NULL,
    target_parish character varying(100),
    target_post_id integer,
    operator character varying(10) NOT NULL,
    value character varying(100) NOT NULL,
    logic_operator character varying(10) DEFAULT 'AND'::character varying
);


--
-- Name: policy_rule_conditions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.policy_rule_conditions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: policy_rule_conditions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.policy_rule_conditions_id_seq OWNED BY public.policy_rule_conditions.id;


--
-- Name: policy_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_rules (
    id integer NOT NULL,
    region_id character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    priority integer DEFAULT 100,
    is_active boolean DEFAULT true,
    is_auto_execute boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: policy_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.policy_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: policy_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.policy_rules_id_seq OWNED BY public.policy_rules.id;


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    address text,
    city text,
    state text,
    zip text,
    phone text,
    parish_id integer NOT NULL
);


--
-- Name: posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.posts_id_seq OWNED BY public.posts.id;


--
-- Name: red_zone_status; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.red_zone_status AS
 SELECT parish_id,
    parish_name,
    zone_name,
    month_key,
    target_minutes,
    required_pct,
    included_calls,
    late_included,
    compliance_pct,
        CASE
            WHEN (included_calls = 0) THEN NULL::numeric
            ELSE (((late_included)::numeric * 100.0) / (included_calls)::numeric)
        END AS late_pct,
    contract_status,
        CASE
            WHEN (included_calls = 0) THEN 'no_data'::text
            WHEN ((((late_included)::numeric * 100.0) / (included_calls)::numeric) > 10.0) THEN 'red'::text
            WHEN ((((late_included)::numeric * 100.0) / (included_calls)::numeric) > 7.5) THEN 'yellow'::text
            ELSE 'green'::text
        END AS red_zone_level
   FROM public.parish_zone_contract_status s;


--
-- Name: region_parishes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.region_parishes (
    id integer NOT NULL,
    region_code text NOT NULL,
    parish_id integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: region_parishes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.region_parishes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: region_parishes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.region_parishes_id_seq OWNED BY public.region_parishes.id;


--
-- Name: regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regions (
    name text NOT NULL,
    display_order integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id integer NOT NULL
);


--
-- Name: regions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.regions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: regions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.regions_id_seq OWNED BY public.regions.id;


--
-- Name: response_area_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.response_area_mappings (
    id integer NOT NULL,
    response_area text NOT NULL,
    parish_id integer NOT NULL,
    threshold_minutes numeric,
    locations text[] DEFAULT '{}'::text[],
    boundary jsonb
);


--
-- Name: response_area_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.response_area_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: response_area_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.response_area_mappings_id_seq OWNED BY public.response_area_mappings.id;


--
-- Name: response_zone_geometries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.response_zone_geometries (
    id integer NOT NULL,
    response_zone_id integer NOT NULL,
    geom public.geometry(MultiPolygon,4326) NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: response_zone_geometries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.response_zone_geometries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: response_zone_geometries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.response_zone_geometries_id_seq OWNED BY public.response_zone_geometries.id;


--
-- Name: response_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.response_zones (
    id integer NOT NULL,
    region_code text NOT NULL,
    parish_id integer NOT NULL,
    name text NOT NULL,
    threshold_minutes integer NOT NULL,
    is_parishwide boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: response_zones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.response_zones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: response_zones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.response_zones_id_seq OWNED BY public.response_zones.id;


--
-- Name: stations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stations (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    address text,
    city text,
    state text,
    zip text,
    phone text,
    parish_id integer NOT NULL
);


--
-- Name: stations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stations_id_seq OWNED BY public.stations.id;


--
-- Name: time_edit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_edit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    call_id integer NOT NULL,
    field_name character varying(50) NOT NULL,
    old_value text,
    new_value text,
    call_snapshot_before jsonb NOT NULL,
    edited_by_user_id uuid,
    edited_by_email character varying(255) NOT NULL,
    edited_by_name character varying(255),
    edited_by_role character varying(50),
    reason text NOT NULL,
    metadata jsonb,
    edit_session_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uploads (
    id integer NOT NULL,
    parish_id integer NOT NULL,
    uploaded_by text,
    original_filename text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: uploads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uploads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uploads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uploads_id_seq OWNED BY public.uploads.id;


--
-- Name: user_supervision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_supervision (
    id integer NOT NULL,
    supervisor_user_id uuid NOT NULL,
    subordinate_user_id uuid NOT NULL,
    CONSTRAINT no_self_supervision CHECK ((supervisor_user_id <> subordinate_user_id))
);


--
-- Name: user_supervision_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_supervision_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_supervision_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_supervision_id_seq OWNED BY public.user_supervision.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text,
    email text NOT NULL,
    password_hash text,
    role text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    allowed_regions text[] DEFAULT '{}'::text[] NOT NULL,
    has_all_regions boolean DEFAULT false NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    display_name text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: weather_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weather_events (
    id bigint NOT NULL,
    nws_id text NOT NULL,
    source text DEFAULT 'NWS'::text NOT NULL,
    state text,
    event text,
    severity text,
    certainty text,
    urgency text,
    area_desc text,
    category text,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    geojson jsonb,
    raw_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: weather_alerts_normalized; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.weather_alerts_normalized AS
 SELECT id,
    nws_id,
    source,
    state,
    event,
    severity,
    certainty,
    urgency,
    area_desc,
    category,
    starts_at,
    ends_at,
    geojson,
    raw_json,
    created_at,
    updated_at,
    COALESCE(starts_at, created_at) AS alert_start,
    ends_at AS alert_end
   FROM public.weather_events w
  WHERE ((geojson IS NOT NULL) AND (COALESCE(starts_at, created_at) IS NOT NULL) AND (ends_at IS NOT NULL));


--
-- Name: weather_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.weather_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: weather_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.weather_events_id_seq OWNED BY public.weather_events.id;


--
-- Name: zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zones (
    id integer NOT NULL,
    parish_id integer NOT NULL,
    name text NOT NULL,
    threshold_minutes integer NOT NULL,
    compliance_target numeric(5,2) NOT NULL
);


--
-- Name: zones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zones_id_seq OWNED BY public.zones.id;


--
-- Name: auto_exclusion_configs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_exclusion_configs ALTER COLUMN id SET DEFAULT nextval('public.auto_exclusion_configs_id_seq'::regclass);


--
-- Name: auto_exclusions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_exclusions ALTER COLUMN id SET DEFAULT nextval('public.auto_exclusions_id_seq'::regclass);


--
-- Name: boundary_sources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boundary_sources ALTER COLUMN id SET DEFAULT nextval('public.boundary_sources_id_seq'::regclass);


--
-- Name: call_exclusion_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_exclusion_audit ALTER COLUMN id SET DEFAULT nextval('public.call_exclusion_audit_id_seq'::regclass);


--
-- Name: call_weather_exclusion_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_weather_exclusion_audit ALTER COLUMN id SET DEFAULT nextval('public.call_weather_exclusion_audit_id_seq'::regclass);


--
-- Name: calls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls ALTER COLUMN id SET DEFAULT nextval('public.calls_id_seq'::regclass);


--
-- Name: coverage_level_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_level_posts ALTER COLUMN id SET DEFAULT nextval('public.coverage_level_posts_id_seq'::regclass);


--
-- Name: coverage_levels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_levels ALTER COLUMN id SET DEFAULT nextval('public.coverage_levels_id_seq'::regclass);


--
-- Name: coverage_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_posts ALTER COLUMN id SET DEFAULT nextval('public.coverage_posts_id_seq'::regclass);


--
-- Name: deployment_isochrones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_isochrones ALTER COLUMN id SET DEFAULT nextval('public.deployment_isochrones_id_seq'::regclass);


--
-- Name: deployment_sites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_sites ALTER COLUMN id SET DEFAULT nextval('public.deployment_sites_id_seq'::regclass);


--
-- Name: exception_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exception_types ALTER COLUMN id SET DEFAULT nextval('public.exception_types_id_seq'::regclass);


--
-- Name: jurisdiction_boundaries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdiction_boundaries ALTER COLUMN id SET DEFAULT nextval('public.jurisdiction_boundaries_id_seq'::regclass);


--
-- Name: jurisdiction_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdiction_types ALTER COLUMN id SET DEFAULT nextval('public.jurisdiction_types_id_seq'::regclass);


--
-- Name: jurisdictions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdictions ALTER COLUMN id SET DEFAULT nextval('public.jurisdictions_id_seq'::regclass);


--
-- Name: manual_exclusions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_exclusions ALTER COLUMN id SET DEFAULT nextval('public.manual_exclusions_id_seq'::regclass);


--
-- Name: monthly_metrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_metrics ALTER COLUMN id SET DEFAULT nextval('public.monthly_metrics_id_seq'::regclass);


--
-- Name: om_parish_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.om_parish_assignments ALTER COLUMN id SET DEFAULT nextval('public.om_parish_assignments_id_seq'::regclass);


--
-- Name: parish_config_exceptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_config_exceptions ALTER COLUMN id SET DEFAULT nextval('public.parish_config_exceptions_id_seq'::regclass);


--
-- Name: parish_config_zones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_config_zones ALTER COLUMN id SET DEFAULT nextval('public.parish_config_zones_id_seq'::regclass);


--
-- Name: parish_configs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_configs ALTER COLUMN id SET DEFAULT nextval('public.parish_configs_id_seq'::regclass);


--
-- Name: parishes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parishes ALTER COLUMN id SET DEFAULT nextval('public.parishes_id_seq'::regclass);


--
-- Name: policy_rule_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_rule_actions ALTER COLUMN id SET DEFAULT nextval('public.policy_rule_actions_id_seq'::regclass);


--
-- Name: policy_rule_conditions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_rule_conditions ALTER COLUMN id SET DEFAULT nextval('public.policy_rule_conditions_id_seq'::regclass);


--
-- Name: policy_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_rules ALTER COLUMN id SET DEFAULT nextval('public.policy_rules_id_seq'::regclass);


--
-- Name: posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts ALTER COLUMN id SET DEFAULT nextval('public.posts_id_seq'::regclass);


--
-- Name: region_parishes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_parishes ALTER COLUMN id SET DEFAULT nextval('public.region_parishes_id_seq'::regclass);


--
-- Name: regions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions ALTER COLUMN id SET DEFAULT nextval('public.regions_id_seq'::regclass);


--
-- Name: response_area_mappings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_area_mappings ALTER COLUMN id SET DEFAULT nextval('public.response_area_mappings_id_seq'::regclass);


--
-- Name: response_zone_geometries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_zone_geometries ALTER COLUMN id SET DEFAULT nextval('public.response_zone_geometries_id_seq'::regclass);


--
-- Name: response_zones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_zones ALTER COLUMN id SET DEFAULT nextval('public.response_zones_id_seq'::regclass);


--
-- Name: stations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations ALTER COLUMN id SET DEFAULT nextval('public.stations_id_seq'::regclass);


--
-- Name: uploads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploads ALTER COLUMN id SET DEFAULT nextval('public.uploads_id_seq'::regclass);


--
-- Name: user_supervision id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_supervision ALTER COLUMN id SET DEFAULT nextval('public.user_supervision_id_seq'::regclass);


--
-- Name: weather_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_events ALTER COLUMN id SET DEFAULT nextval('public.weather_events_id_seq'::regclass);


--
-- Name: zones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones ALTER COLUMN id SET DEFAULT nextval('public.zones_id_seq'::regclass);


--
-- Name: users_sync users_sync_pkey; Type: CONSTRAINT; Schema: neon_auth; Owner: -
--

ALTER TABLE ONLY neon_auth.users_sync
    ADD CONSTRAINT users_sync_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auto_exclusion_configs auto_exclusion_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_exclusion_configs
    ADD CONSTRAINT auto_exclusion_configs_pkey PRIMARY KEY (id);


--
-- Name: auto_exclusion_configs auto_exclusion_configs_region_id_strategy_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_exclusion_configs
    ADD CONSTRAINT auto_exclusion_configs_region_id_strategy_key_key UNIQUE (region_id, strategy_key);


--
-- Name: auto_exclusions auto_exclusions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_exclusions
    ADD CONSTRAINT auto_exclusions_pkey PRIMARY KEY (id);


--
-- Name: boundary_sources boundary_sources_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boundary_sources
    ADD CONSTRAINT boundary_sources_name_key UNIQUE (name);


--
-- Name: boundary_sources boundary_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boundary_sources
    ADD CONSTRAINT boundary_sources_pkey PRIMARY KEY (id);


--
-- Name: call_exclusion_audit call_exclusion_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_exclusion_audit
    ADD CONSTRAINT call_exclusion_audit_pkey PRIMARY KEY (id);


--
-- Name: call_weather_exclusion_audit call_weather_exclusion_audit_call_id_weather_event_id_exclu_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_weather_exclusion_audit
    ADD CONSTRAINT call_weather_exclusion_audit_call_id_weather_event_id_exclu_key UNIQUE (call_id, weather_event_id, exclusion_strategy);


--
-- Name: call_weather_exclusion_audit call_weather_exclusion_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_weather_exclusion_audit
    ADD CONSTRAINT call_weather_exclusion_audit_pkey PRIMARY KEY (id);


--
-- Name: calls calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_pkey PRIMARY KEY (id);


--
-- Name: coverage_level_posts coverage_level_posts_level_id_post_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_level_posts
    ADD CONSTRAINT coverage_level_posts_level_id_post_id_key UNIQUE (level_id, post_id);


--
-- Name: coverage_level_posts coverage_level_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_level_posts
    ADD CONSTRAINT coverage_level_posts_pkey PRIMARY KEY (id);


--
-- Name: coverage_levels coverage_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_levels
    ADD CONSTRAINT coverage_levels_pkey PRIMARY KEY (id);


--
-- Name: coverage_levels coverage_levels_region_id_level_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_levels
    ADD CONSTRAINT coverage_levels_region_id_level_number_key UNIQUE (region_id, level_number);


--
-- Name: coverage_posts coverage_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_posts
    ADD CONSTRAINT coverage_posts_pkey PRIMARY KEY (id);


--
-- Name: deployment_isochrones deployment_isochrones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_isochrones
    ADD CONSTRAINT deployment_isochrones_pkey PRIMARY KEY (id);


--
-- Name: deployment_sites deployment_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_sites
    ADD CONSTRAINT deployment_sites_pkey PRIMARY KEY (id);


--
-- Name: exception_types exception_types_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exception_types
    ADD CONSTRAINT exception_types_code_key UNIQUE (code);


--
-- Name: exception_types exception_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exception_types
    ADD CONSTRAINT exception_types_pkey PRIMARY KEY (id);


--
-- Name: exclusion_logs exclusion_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exclusion_logs
    ADD CONSTRAINT exclusion_logs_pkey PRIMARY KEY (id);


--
-- Name: jurisdiction_boundaries jurisdiction_boundaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdiction_boundaries
    ADD CONSTRAINT jurisdiction_boundaries_pkey PRIMARY KEY (id);


--
-- Name: jurisdiction_types jurisdiction_types_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdiction_types
    ADD CONSTRAINT jurisdiction_types_code_key UNIQUE (code);


--
-- Name: jurisdiction_types jurisdiction_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdiction_types
    ADD CONSTRAINT jurisdiction_types_pkey PRIMARY KEY (id);


--
-- Name: jurisdictions jurisdictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdictions
    ADD CONSTRAINT jurisdictions_pkey PRIMARY KEY (id);


--
-- Name: manual_exclusions manual_exclusions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_exclusions
    ADD CONSTRAINT manual_exclusions_pkey PRIMARY KEY (id);


--
-- Name: monthly_metrics monthly_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_metrics
    ADD CONSTRAINT monthly_metrics_pkey PRIMARY KEY (id);


--
-- Name: om_parish_assignments om_parish_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.om_parish_assignments
    ADD CONSTRAINT om_parish_assignments_pkey PRIMARY KEY (id);


--
-- Name: parish_config_exceptions parish_config_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_config_exceptions
    ADD CONSTRAINT parish_config_exceptions_pkey PRIMARY KEY (id);


--
-- Name: parish_config_zones parish_config_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_config_zones
    ADD CONSTRAINT parish_config_zones_pkey PRIMARY KEY (id);


--
-- Name: parish_configs parish_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_configs
    ADD CONSTRAINT parish_configs_pkey PRIMARY KEY (id);


--
-- Name: parish_settings parish_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_settings
    ADD CONSTRAINT parish_settings_pkey PRIMARY KEY (parish_id);


--
-- Name: parish_uploads parish_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_uploads
    ADD CONSTRAINT parish_uploads_pkey PRIMARY KEY (id);


--
-- Name: parishes parishes_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parishes
    ADD CONSTRAINT parishes_name_key UNIQUE (name);


--
-- Name: parishes parishes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parishes
    ADD CONSTRAINT parishes_pkey PRIMARY KEY (id);


--
-- Name: policy_rule_actions policy_rule_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_rule_actions
    ADD CONSTRAINT policy_rule_actions_pkey PRIMARY KEY (id);


--
-- Name: policy_rule_conditions policy_rule_conditions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_rule_conditions
    ADD CONSTRAINT policy_rule_conditions_pkey PRIMARY KEY (id);


--
-- Name: policy_rules policy_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_rules
    ADD CONSTRAINT policy_rules_pkey PRIMARY KEY (id);


--
-- Name: posts posts_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_code_key UNIQUE (code);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: region_parishes region_parishes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_parishes
    ADD CONSTRAINT region_parishes_pkey PRIMARY KEY (id);


--
-- Name: region_parishes region_parishes_region_code_parish_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_parishes
    ADD CONSTRAINT region_parishes_region_code_parish_id_key UNIQUE (region_code, parish_id);


--
-- Name: regions regions_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_id_key UNIQUE (id);


--
-- Name: regions regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (name);


--
-- Name: response_area_mappings response_area_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_area_mappings
    ADD CONSTRAINT response_area_mappings_pkey PRIMARY KEY (id);


--
-- Name: response_area_mappings response_area_mappings_response_area_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_area_mappings
    ADD CONSTRAINT response_area_mappings_response_area_key UNIQUE (response_area);


--
-- Name: response_zone_geometries response_zone_geometries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_zone_geometries
    ADD CONSTRAINT response_zone_geometries_pkey PRIMARY KEY (id);


--
-- Name: response_zones response_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_zones
    ADD CONSTRAINT response_zones_pkey PRIMARY KEY (id);


--
-- Name: stations stations_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_code_key UNIQUE (code);


--
-- Name: stations stations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_pkey PRIMARY KEY (id);


--
-- Name: time_edit_logs time_edit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_edit_logs
    ADD CONSTRAINT time_edit_logs_pkey PRIMARY KEY (id);


--
-- Name: monthly_metrics unique_monthly_metric; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_metrics
    ADD CONSTRAINT unique_monthly_metric UNIQUE (parish_id, zone_name, month_key);


--
-- Name: parish_config_exceptions unique_parish_config_exception; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_config_exceptions
    ADD CONSTRAINT unique_parish_config_exception UNIQUE (parish_config_id, exception_type_id);


--
-- Name: parish_configs unique_parish_config_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_configs
    ADD CONSTRAINT unique_parish_config_version UNIQUE (parish_id, version);


--
-- Name: user_supervision unique_supervision; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_supervision
    ADD CONSTRAINT unique_supervision UNIQUE (supervisor_user_id, subordinate_user_id);


--
-- Name: uploads uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_pkey PRIMARY KEY (id);


--
-- Name: jurisdictions uq_jurisdiction_type_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdictions
    ADD CONSTRAINT uq_jurisdiction_type_code UNIQUE (type_id, code);


--
-- Name: user_supervision user_supervision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_supervision
    ADD CONSTRAINT user_supervision_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: weather_events weather_events_nws_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_events
    ADD CONSTRAINT weather_events_nws_id_key UNIQUE (nws_id);


--
-- Name: weather_events weather_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_events
    ADD CONSTRAINT weather_events_pkey PRIMARY KEY (id);


--
-- Name: zones zones_parish_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_parish_id_name_key UNIQUE (parish_id, name);


--
-- Name: zones zones_parish_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_parish_name_unique UNIQUE (parish_id, name);


--
-- Name: zones zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_pkey PRIMARY KEY (id);


--
-- Name: users_sync_deleted_at_idx; Type: INDEX; Schema: neon_auth; Owner: -
--

CREATE INDEX users_sync_deleted_at_idx ON neon_auth.users_sync USING btree (deleted_at);


--
-- Name: idx_call_exclusion_audit_call_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_exclusion_audit_call_id ON public.call_exclusion_audit USING btree (call_id);


--
-- Name: idx_call_exclusion_audit_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_exclusion_audit_type ON public.call_exclusion_audit USING btree (exclusion_type);


--
-- Name: idx_calls_auto_exclusion_evaluated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_auto_exclusion_evaluated ON public.calls USING btree (auto_exclusion_evaluated) WHERE (auto_exclusion_evaluated = false);


--
-- Name: idx_calls_compliance_time_minutes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_compliance_time_minutes ON public.calls USING btree (compliance_time_minutes) WHERE (compliance_time_minutes IS NOT NULL);


--
-- Name: idx_calls_exclusion_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_exclusion_type ON public.calls USING btree (exclusion_type);


--
-- Name: idx_calls_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_geom ON public.calls USING gist (geom);


--
-- Name: idx_calls_is_confirmed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_is_confirmed ON public.calls USING btree (is_confirmed) WHERE (is_confirmed = true);


--
-- Name: idx_calls_is_excluded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_is_excluded ON public.calls USING btree (is_excluded) WHERE (is_excluded = true);


--
-- Name: idx_calls_parish_queue_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_parish_queue_time ON public.calls USING btree (parish_id, call_in_que_time);


--
-- Name: idx_calls_region_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_region_id ON public.calls USING btree (region_id);


--
-- Name: idx_deployment_isochrones_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deployment_isochrones_geom ON public.deployment_isochrones USING gist (geom);


--
-- Name: idx_deployment_sites_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deployment_sites_geom ON public.deployment_sites USING gist (geom);


--
-- Name: idx_exclusion_logs_call_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exclusion_logs_call_id ON public.exclusion_logs USING btree (call_id);


--
-- Name: idx_exclusion_logs_type_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exclusion_logs_type_date ON public.exclusion_logs USING btree (exclusion_type, created_at);


--
-- Name: idx_exclusion_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exclusion_logs_user ON public.exclusion_logs USING btree (created_by_user_id);


--
-- Name: idx_jb_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jb_geom ON public.jurisdiction_boundaries USING gist (geom);


--
-- Name: idx_jb_jurisdiction_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jb_jurisdiction_role ON public.jurisdiction_boundaries USING btree (jurisdiction_id, boundary_role);


--
-- Name: idx_monthly_metrics_month_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monthly_metrics_month_key ON public.monthly_metrics USING btree (month_key);


--
-- Name: idx_monthly_metrics_parish; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monthly_metrics_parish ON public.monthly_metrics USING btree (parish_id);


--
-- Name: idx_om_parish_om_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_om_parish_om_user ON public.om_parish_assignments USING btree (om_user_id);


--
-- Name: idx_om_parish_parish; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_om_parish_parish ON public.om_parish_assignments USING btree (parish_id);


--
-- Name: idx_parish_configs_parish; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parish_configs_parish ON public.parish_configs USING btree (parish_id);


--
-- Name: idx_pc_exceptions_parish_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pc_exceptions_parish_config ON public.parish_config_exceptions USING btree (parish_config_id);


--
-- Name: idx_pc_zones_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pc_zones_name ON public.parish_config_zones USING btree (zone_name);


--
-- Name: idx_pc_zones_parish_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pc_zones_parish_config ON public.parish_config_zones USING btree (parish_config_id);


--
-- Name: idx_region_parishes_region_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_region_parishes_region_code ON public.region_parishes USING btree (region_code);


--
-- Name: idx_response_zone_geometries_geom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_response_zone_geometries_geom ON public.response_zone_geometries USING gist (geom);


--
-- Name: idx_time_edit_logs_call_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_edit_logs_call_id ON public.time_edit_logs USING btree (call_id);


--
-- Name: idx_time_edit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_edit_logs_created ON public.time_edit_logs USING btree (created_at DESC);


--
-- Name: idx_time_edit_logs_field; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_edit_logs_field ON public.time_edit_logs USING btree (field_name);


--
-- Name: idx_time_edit_logs_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_edit_logs_session ON public.time_edit_logs USING btree (edit_session_id);


--
-- Name: idx_time_edit_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_edit_logs_user ON public.time_edit_logs USING btree (edited_by_email);


--
-- Name: idx_user_supervision_subordinate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_supervision_subordinate ON public.user_supervision USING btree (subordinate_user_id);


--
-- Name: idx_user_supervision_supervisor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_supervision_supervisor ON public.user_supervision USING btree (supervisor_user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_weather_events_nws_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_weather_events_nws_id ON public.weather_events USING btree (nws_id);


--
-- Name: idx_weather_events_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weather_events_state ON public.weather_events USING btree (state);


--
-- Name: idx_weather_events_time_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weather_events_time_window ON public.weather_events USING btree (starts_at, ends_at);


--
-- Name: uq_jb_jurisdiction_source_role; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_jb_jurisdiction_source_role ON public.jurisdiction_boundaries USING btree (jurisdiction_id, source_id, boundary_role);


--
-- Name: ux_deployment_isochrones_site_minutes; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_deployment_isochrones_site_minutes ON public.deployment_isochrones USING btree (site_id, minutes);


--
-- Name: weather_events_nws_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX weather_events_nws_id_idx ON public.weather_events USING btree (nws_id);


--
-- Name: weather_events trg_weather_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_weather_events_updated_at BEFORE UPDATE ON public.weather_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();


--
-- Name: auto_exclusion_configs auto_exclusion_configs_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_exclusion_configs
    ADD CONSTRAINT auto_exclusion_configs_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE CASCADE;


--
-- Name: auto_exclusions auto_exclusions_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_exclusions
    ADD CONSTRAINT auto_exclusions_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id);


--
-- Name: call_exclusion_audit call_exclusion_audit_weather_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_exclusion_audit
    ADD CONSTRAINT call_exclusion_audit_weather_event_id_fkey FOREIGN KEY (weather_event_id) REFERENCES public.weather_events(id);


--
-- Name: coverage_level_posts coverage_level_posts_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_level_posts
    ADD CONSTRAINT coverage_level_posts_level_id_fkey FOREIGN KEY (level_id) REFERENCES public.coverage_levels(id) ON DELETE CASCADE;


--
-- Name: coverage_level_posts coverage_level_posts_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coverage_level_posts
    ADD CONSTRAINT coverage_level_posts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.coverage_posts(id) ON DELETE CASCADE;


--
-- Name: deployment_isochrones deployment_isochrones_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_isochrones
    ADD CONSTRAINT deployment_isochrones_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.deployment_sites(id) ON DELETE CASCADE;


--
-- Name: jurisdiction_boundaries jurisdiction_boundaries_jurisdiction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdiction_boundaries
    ADD CONSTRAINT jurisdiction_boundaries_jurisdiction_id_fkey FOREIGN KEY (jurisdiction_id) REFERENCES public.jurisdictions(id) ON DELETE CASCADE;


--
-- Name: jurisdiction_boundaries jurisdiction_boundaries_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdiction_boundaries
    ADD CONSTRAINT jurisdiction_boundaries_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.boundary_sources(id);


--
-- Name: jurisdictions jurisdictions_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdictions
    ADD CONSTRAINT jurisdictions_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.jurisdiction_types(id);


--
-- Name: manual_exclusions manual_exclusions_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_exclusions
    ADD CONSTRAINT manual_exclusions_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id);


--
-- Name: manual_exclusions manual_exclusions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_exclusions
    ADD CONSTRAINT manual_exclusions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: monthly_metrics monthly_metrics_parish_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_metrics
    ADD CONSTRAINT monthly_metrics_parish_config_id_fkey FOREIGN KEY (parish_config_id) REFERENCES public.parish_configs(id);


--
-- Name: monthly_metrics monthly_metrics_parish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_metrics
    ADD CONSTRAINT monthly_metrics_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES public.parishes(id) ON DELETE CASCADE;


--
-- Name: om_parish_assignments om_parish_assignments_om_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.om_parish_assignments
    ADD CONSTRAINT om_parish_assignments_om_user_id_fkey FOREIGN KEY (om_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: om_parish_assignments om_parish_assignments_parish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.om_parish_assignments
    ADD CONSTRAINT om_parish_assignments_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES public.parishes(id) ON DELETE CASCADE;


--
-- Name: parish_config_exceptions parish_config_exceptions_exception_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_config_exceptions
    ADD CONSTRAINT parish_config_exceptions_exception_type_id_fkey FOREIGN KEY (exception_type_id) REFERENCES public.exception_types(id);


--
-- Name: parish_config_exceptions parish_config_exceptions_parish_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_config_exceptions
    ADD CONSTRAINT parish_config_exceptions_parish_config_id_fkey FOREIGN KEY (parish_config_id) REFERENCES public.parish_configs(id) ON DELETE CASCADE;


--
-- Name: parish_config_zones parish_config_zones_parish_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_config_zones
    ADD CONSTRAINT parish_config_zones_parish_config_id_fkey FOREIGN KEY (parish_config_id) REFERENCES public.parish_configs(id) ON DELETE CASCADE;


--
-- Name: parish_configs parish_configs_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_configs
    ADD CONSTRAINT parish_configs_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: parish_configs parish_configs_parish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_configs
    ADD CONSTRAINT parish_configs_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES public.parishes(id) ON DELETE CASCADE;


--
-- Name: parish_uploads parish_uploads_parish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_uploads
    ADD CONSTRAINT parish_uploads_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES public.parishes(id);


--
-- Name: parish_uploads parish_uploads_uploaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parish_uploads
    ADD CONSTRAINT parish_uploads_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id);


--
-- Name: policy_rule_actions policy_rule_actions_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_rule_actions
    ADD CONSTRAINT policy_rule_actions_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.policy_rules(id) ON DELETE CASCADE;


--
-- Name: policy_rule_conditions policy_rule_conditions_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_rule_conditions
    ADD CONSTRAINT policy_rule_conditions_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.policy_rules(id) ON DELETE CASCADE;


--
-- Name: posts posts_parish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES public.parishes(id);


--
-- Name: region_parishes region_parishes_parish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_parishes
    ADD CONSTRAINT region_parishes_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES public.parishes(id) ON DELETE CASCADE;


--
-- Name: response_area_mappings response_area_mappings_parish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_area_mappings
    ADD CONSTRAINT response_area_mappings_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES public.parishes(id);


--
-- Name: response_zone_geometries response_zone_geometries_response_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.response_zone_geometries
    ADD CONSTRAINT response_zone_geometries_response_zone_id_fkey FOREIGN KEY (response_zone_id) REFERENCES public.response_zones(id) ON DELETE CASCADE;


--
-- Name: stations stations_parish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stations
    ADD CONSTRAINT stations_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES public.parishes(id);


--
-- Name: uploads uploads_parish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES public.parishes(id) ON DELETE CASCADE;


--
-- Name: user_supervision user_supervision_subordinate_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_supervision
    ADD CONSTRAINT user_supervision_subordinate_user_id_fkey FOREIGN KEY (subordinate_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_supervision user_supervision_supervisor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_supervision
    ADD CONSTRAINT user_supervision_supervisor_user_id_fkey FOREIGN KEY (supervisor_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: zones zones_parish_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_parish_fk FOREIGN KEY (parish_id) REFERENCES public.parishes(id);


--
-- Name: zones zones_parish_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zones
    ADD CONSTRAINT zones_parish_id_fkey FOREIGN KEY (parish_id) REFERENCES public.parishes(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict TDOaHfB7YDr1cA4rXgczHvO5xpi6Eb7vDKhysmwwhmAJiFya9jEFsJyvPnSOrKu

