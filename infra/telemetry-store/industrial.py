"""Additive industrial series. Original captures/catalog remain authoritative in MongoDB."""
import math
import re
import json
from datetime import datetime
import psycopg
from psycopg.types.json import Jsonb


def instant(value):
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if result.tzinfo is None:
            raise ValueError('timezone required')
        return result
    except (AttributeError, TypeError, ValueError) as error:
        raise ValueError('invalid industrial timestamp') from error


def bounded(value, size, optional=False):
    if optional and value is None:
        return None
    if not isinstance(value, str) or not value or len(value) > size:
        raise ValueError('invalid industrial text')
    return value


def insert_industrial(dsn, payload):
    signals = payload.get('signals') if isinstance(payload, dict) else None
    if not isinstance(signals, list) or not 1 <= len(signals) <= 100:
        raise ValueError('invalid industrial batch')
    rows = []
    for s in signals:
        if not isinstance(s, dict):
            raise ValueError('invalid industrial signal')
        signal = bounded(s.get('id'), 64)
        event = bounded(s.get('eventId'), 64)
        if not re.fullmatch(r'[a-f0-9]{64}', signal) or not re.fullmatch(r'[a-f0-9-]{36,64}', event):
            raise ValueError('invalid industrial references')
        if s.get('protocol') not in ('MQTT', 'SNMP') or s.get('kind') not in ('measurement', 'state', 'event', 'alarm', 'unknown') or s.get('quality') not in ('UNOBSERVED', 'VALID', 'STALE', 'INVALID', 'UNKNOWN', 'OFFLINE'):
            raise ValueError('invalid industrial classification')
        value = s.get('value')
        numeric = float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None
        if numeric is not None and not math.isfinite(numeric):
            raise ValueError('invalid industrial numeric value')
        unit = s.get('unit')
        if unit is not None and (not isinstance(unit, str) or len(unit) > 64):
            raise ValueError('invalid industrial unit')
        # Keep normalized provenance without copying the original raw capture.
        sample = {k: v for k, v in s.items() if k != 'rawValue'}
        json.dumps(sample, allow_nan=False)
        rows.append((instant(s.get('observedAt')), instant(s.get('receivedAt')), signal, event,
                     bounded(s.get('logicalPointId'), 200, True), bounded(s.get('sourceIdentity'), 120),
                     s['protocol'], s['kind'], numeric, unit, s['quality'], Jsonb(sample)))
    with psycopg.connect(dsn) as conn:
        for row in rows:
            conn.execute('''INSERT INTO industrial_observations
              (observed_at, received_at, signal_id, event_id, logical_point_id, source_identity,
               protocol, kind, numeric_value, unit, quality, sample)
              VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
              ON CONFLICT (observed_at, signal_id, event_id) DO NOTHING''', row)
    return len(rows)


def query_industrial(dsn, query):
    signal = query.get('signalId', [None])[0]
    logical = query.get('logicalPointId', [None])[0]
    if bool(signal) == bool(logical):
        raise ValueError('provide exactly one industrial identity')
    if signal and not re.fullmatch(r'[a-f0-9]{64}', signal):
        raise ValueError('invalid signal identity')
    if logical:
        bounded(logical, 200)
    start = instant(query.get('from', [None])[0])
    end = instant(query.get('to', [None])[0])
    if start >= end or (end - start).total_seconds() > 366 * 86400:
        raise ValueError('invalid industrial time range')
    aliases = query.get('aliasId', [])
    if len(aliases) > 64 or any(not re.fullmatch(r'[a-f0-9]{64}', a) for a in aliases):
        raise ValueError('invalid historical aliases')
    params = [signal or logical]
    where = 'signal_id = %s' if signal else 'logical_point_id = %s'
    if logical and aliases:
        where = '(' + where + ' OR signal_id = ANY(%s))'
        params.append(aliases)
    cursor = query.get('cursor', [None])[0]
    if cursor:
        try:
            cursor_at, cursor_event, cursor_signal = json.loads(cursor)
            instant(cursor_at)
            if not re.fullmatch(r'[a-f0-9-]{36,64}', cursor_event) or not re.fullmatch(r'[a-f0-9]{64}', cursor_signal):
                raise ValueError('invalid cursor')
        except (TypeError, ValueError) as error:
            raise ValueError('invalid cursor') from error
        where += ' AND (observed_at, event_id, signal_id) < (%s,%s,%s)'
        params += [instant(cursor_at), cursor_event, cursor_signal]
    params += [start, end]
    with psycopg.connect(dsn) as conn:
        rows = conn.execute('SELECT sample FROM industrial_observations WHERE ' + where + '''
          AND observed_at >= %s AND observed_at < %s
          ORDER BY observed_at DESC, event_id DESC, signal_id DESC LIMIT 1000''',
          params).fetchall()
    samples = [row[0] for row in rows]
    last = samples[-1] if len(samples) == 1000 else None
    return {'observations': samples, 'limit': 1000,
            'nextCursor': json.dumps([last['observedAt'], last['eventId'], last['id']]) if last else None}
