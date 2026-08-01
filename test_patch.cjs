const fs = require('fs');
const file = 'src/context/AppContext.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /const applicationRef = await addDoc\(\s*collection\(db, "recruitment_applications"\),\s*\{[\s\S]*?\}\s*,\s*\);/m,
  `let applicationRef;
      try {
        applicationRef = await addDoc(
          collection(db, "recruitment_applications"),
          {
            ...data,
            type: "driver_application",
            email: normalizedEmail,
            status: "pending",
            createdAt: new Date().toISOString(),
          },
        );
      } catch (err) {
        console.error("addDoc recruitment_applications failed:", err);
        throw new Error("addDoc recruitment_applications failed: " + err.message);
      }`
);

code = code.replace(
  /await setDoc\(\s*doc\(db, "users", auth\.currentUser\.uid\),\s*\{\s*applicationSubmitted: true,\s*status: "pending", \/\/[^\n]*\n\s*\},\s*\{\s*merge: true\s*\}\s*,\s*\);/m,
  `try {
          await setDoc(
            doc(db, "users", auth.currentUser.uid),
            {
              applicationSubmitted: true,
              status: "pending", // Update their own user status
            },
            { merge: true },
          );
        } catch (err) {
          console.error("setDoc users failed:", err);
          throw new Error("setDoc users failed: " + err.message);
        }`
);

fs.writeFileSync(file, code);
