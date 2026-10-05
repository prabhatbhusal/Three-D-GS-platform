/**
 * Studio accounts. With DATABASE_URL set (Supabase or any Postgres) they live
 * in the database (usersStore-pg.js); without it, in JSON files under
 * DATA_DIR/users (usersStore-file.js). Both export the same functions.
 * Copy file accounts into the database with: npm run db:import-users
 */
const impl = process.env.DATABASE_URL ? await import('./usersStore-pg.js') : await import('./usersStore-file.js');

export const {
  listUsers, getUserById, getUserByEmail, setUserRole, createUser, createStaffAccount,
  passwordChangedAt, createResetToken, resetPassword, setPassword, deleteUser, verifyUser
} = impl;
