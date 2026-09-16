import { can, ACTIONS } from "../permissions.js";
import {
  createSemester,
  createSubject,
  getAllSemesters,
  getAllSubjects,
  getMajors,
} from "../firestore.js";

const PLAN = [
  [1, 1, [["821011", "MATH Calculus I", 3], ["3821011", "CS Introduction To Programming", 3], ["3821024", "PHY General Physics (2)", 3], ["3821061", "CS Introduction To Programming Lab", 1]]],
  [1, 2, [["821021", "SE English Skills In Information Technology", 3], ["3821023", "MATH Calculus II", 3], ["3821127", "SE Introduction To Object-Oriented Programming", 3], ["3821131", "SE Introduction To Object-Oriented Programming Lab", 1], ["822411", "MATH Discrete Mathematics", 3], ["3921060", "PHY General Physics (Laboratory) (2)", 1]]],
  [2, 1, [["1732160", "CS Object-Oriented Software Modeling Lab", 1], ["2032010", "HI Web Design Lab", 1], ["3822031", "DS Communication And Professional Ethics", 2], ["3822112", "CS Data Structures", 3], ["3822123", "CS Data Structures Lab", 1], ["901400", "MATH Elements Of Linear Algebra", 3]]],
  [2, 2, [["1732821", "CS Theory Of Computing", 3], ["1732841", "CS Analysis And Design Of Algorithms", 3], ["3822215", "DS Fundamentals Of Database Systems", 3], ["3822331", "MATH Probability & Statistics For Computer Sciences", 3], ["3822360", "CPE Digital Logic Design", 3]]],
  [3, 1, [["1733180", "CS Human-Computer Interaction", 3], ["1733420", "CS Computer Networks", 3], ["1736230", "SE Fundamentals Of Software Engineering", 3], ["3822560", "CPE Computer Organization And Design", 3]]],
  [3, 2, [["1733620", "CS Artificial Intelligence", 3], ["1733750", "CS Operating Systems", 3], ["1733850", "CS Fundamentals Of Multimedia", 3], ["3203321", "HI Systems Analysis And Design", 3]]],
  [3, 3, [["1733910", "CS Practical Training", 3]]],
  [4, 1, [["1734511", "CS Computer Architecture", 3], ["1734912", "CS Graduation Project 1", 3], ["1772610", "CY Cryptography", 3], ["3964010", "BT Computational Biology", 3], ["2964011", "BT Computational Biology (Lab)", 0]]],
  [4, 2, [["1734421", "CS Wireless Networks", 3], ["1734751", "CS Distributed Computer Systems", 3], ["1734921", "CS Graduation Project 2", 3], ["3203408", "HI Internet Programming", 2], ["2034090", "HI Internet Programming Laboratory", 1]]],
];

function label(year, semester) { return { en: `Year ${year} - ${semester === 3 ? "Summer" : semester === 1 ? "First" : "Second"} Semester`, ar: `السنة ${year} - الفصل ${semester === 3 ? "الصيفي" : semester === 1 ? "الأول" : "الثاني"}` }; }
function findComputerScience(majors) { return majors.find((major) => /computer\s*science|علوم الحاسوب/i.test(`${major.name?.en || ""} ${major.name?.ar || ""}`)); }

export async function importComputerSciencePlan(profile, UI, T) {
  if (!can(profile, "subjects", ACTIONS.CREATE)) throw new Error(T("admin_import_no_permission"));
  if (!window.confirm(T("admin_import_cs_confirm"))) return null;
  const majors = await getMajors();
  const major = findComputerScience(majors);
  if (!major) throw new Error(T("admin_import_cs_missing_major"));
  const [semesters, subjects] = await Promise.all([getAllSemesters(), getAllSubjects()]);
  const majorSemesters = semesters.filter((semester) => semester.majorId === major.id);
  const majorSubjects = subjects.filter((subject) => subject.majorId === major.id);
  let createdSemesters = 0;
  let createdSubjects = 0;
  const canPublishSubjects = can(profile, "subjects", ACTIONS.PUBLISH);
  const canPublishSemesters = can(profile, "semesters", ACTIONS.PUBLISH);
  for (const [year, semesterNumber, courses] of PLAN) {
    let semester = majorSemesters.find((item) => item.yearNumber === year && item.semesterNumber === semesterNumber);
    if (!semester) {
      const id = await createSemester({ majorId: major.id, name: label(year, semesterNumber), yearNumber: year, semesterNumber, displayOrder: (year - 1) * 3 + semesterNumber, active: canPublishSemesters });
      semester = { id, majorId: major.id, yearNumber: year, semesterNumber };
      majorSemesters.push(semester);
      createdSemesters++;
    }
    for (const [code, name, creditHours] of courses) {
      if (majorSubjects.some((subject) => subject.semesterId === semester.id && subject.code === code)) continue;
      await createSubject({ majorId: major.id, semesterId: semester.id, name: { en: name, ar: name }, code, creditHours, prerequisite: { en: "", ar: "" }, prerequisiteIds: [], description: { en: "", ar: "" }, courseUrl: "", requirementType: "", displayOrder: majorSubjects.length, active: canPublishSubjects });
      createdSubjects++;
    }
  }
  return { createdSemesters, createdSubjects, major: major.name?.en || major.id };
}
