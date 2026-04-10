type SemesterAverageClient = {
  studentProfile: {
    findMany: (args: any) => Promise<
      Array<{
        average: number;
        academicYearId: string | null;
        class?: {
          academicYearId: string | null;
        } | null;
      }>
    >;
  };
  semester: {
    findMany: (args: any) => Promise<Array<{ id: string; academicYearId: string }>>;
    update: (args: any) => Promise<any>;
  };
};

const roundAverage = (value: number): number => Math.round(value * 100) / 100;

export async function computeSemesterAverageForAcademicYear(
  client: SemesterAverageClient,
  schoolId: string,
  academicYearId: string,
): Promise<number | null> {
  const profiles = await client.studentProfile.findMany({
    where: { schoolId },
    select: {
      average: true,
      academicYearId: true,
      class: {
        select: {
          academicYearId: true,
        },
      },
    },
  });

  const averages = profiles
    .filter(
      (profile) =>
        profile.academicYearId === academicYearId ||
        profile.class?.academicYearId === academicYearId,
    )
    .map((profile) => profile.average)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (averages.length === 0) {
    return null;
  }

  const sum = averages.reduce((total, value) => total + value, 0);
  return roundAverage(sum / averages.length);
}

export async function refreshCompletedSemesterAverages(
  client: SemesterAverageClient,
  schoolId: string,
): Promise<void> {
  const semesters = await client.semester.findMany({
    where: {
      schoolId,
      status: 'completed',
    },
    select: {
      id: true,
      academicYearId: true,
    },
  });

  for (const semester of semesters) {
    const average = await computeSemesterAverageForAcademicYear(
      client,
      schoolId,
      semester.academicYearId,
    );

    await client.semester.update({
      where: { id: semester.id },
      data: {
        average,
      },
    });
  }
}
