-- Plan unit editor assignments: restricts who can edit each segment.
-- Empty = no restriction (anyone with board access can edit).
CREATE TABLE IF NOT EXISTS plan_unit_editors (
    unit_id    INTEGER NOT NULL REFERENCES plan_units(id) ON DELETE CASCADE,
    user_email TEXT    NOT NULL,
    PRIMARY KEY (unit_id, user_email)
);
