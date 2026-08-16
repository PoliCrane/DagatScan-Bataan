const { z } = require("zod");

const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join(".");
    return res.status(400).json({ error: field ? `${field}: ${issue.message}` : issue.message });
  }
  req[source] = result.data;
  next();
};

const schemas = {
  login: z.object({
    email: z.string().min(1, "Email is required"),
    password: z.string().min(1, "Password is required"),
  }),
  forgotPassword: z.object({
    email: z.string().min(1, "Email is required"),
  }),
  resetPassword: z.object({
    email: z.string().min(1, "Email is required"),
    resetCode: z.union([z.string(), z.number()]).transform(String),
    newPassword: z.string().min(1, "New password is required"),
  }),
  changePassword: z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(1, "New password is required"),
  }),
  roleUpdate: z.object({
    roles: z.string().min(1, "Role is required"),
    municipality_id: z.union([z.string(), z.number()]).optional(),
  }),
  createUser: z.object({
    username: z.string().min(1, "Username is required"),
    email: z.string().min(1, "Email is required"),
    password: z.string().min(1, "Password is required"),
    roles: z.string().min(1, "Role is required"),
    municipality_id: z.union([z.string(), z.number()]).optional(),
  }),
  approveRequest: z.object({
    password: z.string().min(1, "A password for the new account is required"),
  }),
  rejectRequest: z.object({
    reason: z.string().max(500).optional().nullable(),
  }),
};

module.exports = { validate, schemas, z };
