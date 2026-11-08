# Security baseline

- Authenticate and authorize actions in the owning service. Validate input
  shape, size, semantics and ownership at trust boundaries. Include denied or
  cross-owner cases when authorization changes.
- Preserve internal service authentication, callback signature verification
  and gateway isolation. Keep credentials, bearer tokens and personal data
  out of source, build outputs, logs and test fixtures. Use local demo
  configuration only in its intended environment.
- Review new dependencies, upload and import paths, data exports and access to
  persisted guest or ticket data. Limit privileges and data exposure to what
  the operation needs.
- Seek approval for material changes to authentication, authorization or
  external access. Review client trust boundaries with
  [Frontend security](frontend-security.md).
