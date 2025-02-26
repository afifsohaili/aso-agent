
export async function getOrganizationsForUser(userId: string) {
}

export async function createOrganization(name: string, userId: string) {
  // Start a transaction
  return await db.transaction().execute(async (trx) => {
    // Create the organization
    const [organization] = await trx
      .insertInto('organizations')
      .values({
        name,
      })
      .returning(['id', 'name', 'created_at', 'updated_at'])
      .execute()

    // Add the creator as an admin
    await trx
      .insertInto('memberships')
      .values({
        user_id: userId,
        organization_id: organization.id,
        role: 'admin',
      })
      .execute()

    return organization
  })
}
