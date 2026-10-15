SELECT
  u.email,
  r.role
FROM private.app_role_assignments AS r
JOIN auth.users AS u ON u.id = r.user_id;