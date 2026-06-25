process.env.REGISTRATION_DRY_RUN = "false";

import { registerEmployee } from "../src/lib/registration/index.ts";

const result = await registerEmployee({
  email: "katyushkin@novactiv.ru",
  password: "52TgyHtf",
  firstName: "Валерий",
  lastName: "Катюшкин",
  middleName: "Анатольевич",
  birthDate: "1975-11-20",
  departmentId: "коммерческая-недвижимость-александр-горн-2ba0db",
  createYandex: true,
  createAd: true,
  createBitrix: true,
  createFolder: true,
  passwordChangeRequired: true,
});

console.log(JSON.stringify(result, null, 2));
