```javascript
const GITHUB_OWNER = "namelovetang";
const GITHUB_REPO = "Mini-Dicto";
const GITHUB_FILE = "dictionary.json";
const GITHUB_BRANCH = "main";

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    // -----------------------------
    // CORS
    // -----------------------------
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    // -----------------------------
    // GET - ทดสอบ Worker
    // -----------------------------
    if (request.method === "GET") {
      return jsonResponse(
        {
          success: true,
          message: "Mini-Dicto API is working"
        },
        200,
        corsHeaders
      );
    }

    // -----------------------------
    // POST - เพิ่มคำศัพท์
    // -----------------------------
    if (request.method === "POST") {
      try {
        const data = await request.json();

        // -----------------------------
        // ตรวจสอบข้อมูล
        // -----------------------------
        if (!data.level) {
          return jsonResponse(
            {
              success: false,
              message: "กรุณาเลือกระดับ HSK"
            },
            400,
            corsHeaders
          );
        }

        if (!data.word || !data.word.trim()) {
          return jsonResponse(
            {
              success: false,
              message: "กรุณากรอกคำศัพท์"
            },
            400,
            corsHeaders
          );
        }

        const level = data.level;
        const word = data.word.trim();

        // -----------------------------
        // ตรวจสอบระดับ HSK
        // -----------------------------
        const allowedLevels = [
          "HSK1",
          "HSK2",
          "HSK3",
          "HSK4",
          "HSK5",
          "HSK6"
        ];

        if (!allowedLevels.includes(level)) {
          return jsonResponse(
            {
              success: false,
              message: "ระดับ HSK ไม่ถูกต้อง"
            },
            400,
            corsHeaders
          );
        }

        // -----------------------------
        // สร้างข้อมูลคำศัพท์
        // -----------------------------
        const newWord = {
          word: word,
          pinyin: data.pinyin || "",
          thaiPronunciation: data.thaiPronunciation || "",
          meanings: Array.isArray(data.meanings)
            ? data.meanings
            : data.meanings
              ? [data.meanings]
              : [],
          partOfSpeech: data.partOfSpeech || "",
          examples: Array.isArray(data.examples)
            ? data.examples
            : []
        };

        // -----------------------------
        // 1. อ่าน dictionary.json จาก GitHub
        // -----------------------------
        const githubUrl =
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`;

        const getResponse = await fetch(githubUrl, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Mini-Dicto"
          }
        });

        if (!getResponse.ok) {
          const errorText = await getResponse.text();

          return jsonResponse(
            {
              success: false,
              message: "ไม่สามารถอ่าน dictionary.json จาก GitHub ได้",
              error: errorText
            },
            500,
            corsHeaders
          );
        }

        const githubFile = await getResponse.json();

        // -----------------------------
        // 2. Decode Base64
        // -----------------------------
        const binary = atob(
          githubFile.content.replace(/\n/g, "")
        );

        const bytes = Uint8Array.from(
          binary,
          char => char.charCodeAt(0)
        );

        const decodedText =
          new TextDecoder().decode(bytes);

        const dictionary =
          JSON.parse(decodedText);

        // -----------------------------
        // 3. ตรวจสอบ HSK
        // -----------------------------
        if (!Array.isArray(dictionary[level])) {
          return jsonResponse(
            {
              success: false,
              message: `ไม่พบข้อมูล ${level} ใน dictionary.json`
            },
            400,
            corsHeaders
          );
        }

        // -----------------------------
        // 4. ตรวจสอบคำซ้ำ
        // -----------------------------
        const duplicate =
          dictionary[level].some(
            item =>
              item.word &&
              item.word.trim() === word
          );

        if (duplicate) {
          return jsonResponse(
            {
              success: false,
              message: `คำว่า "${word}" มีอยู่แล้วใน ${level}`
            },
            409,
            corsHeaders
          );
        }

        // -----------------------------
        // 5. เพิ่มคำศัพท์
        // -----------------------------
        dictionary[level].push(newWord);

        // -----------------------------
        // 6. แปลงกลับเป็น JSON
        // -----------------------------
        const updatedJson =
          JSON.stringify(dictionary, null, 2);

        // -----------------------------
        // 7. Encode เป็น Base64
        // -----------------------------
        const updatedBytes =
          new TextEncoder().encode(updatedJson);

        let binaryString = "";

        for (const byte of updatedBytes) {
          binaryString += String.fromCharCode(byte);
        }

        const base64Content =
          btoa(binaryString);

        // -----------------------------
        // 8. บันทึกกลับ GitHub
        // -----------------------------
        const updateResponse = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
          {
            method: "PUT",

            headers: {
              "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
              "Accept": "application/vnd.github+json",
              "Content-Type": "application/json",
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "Mini-Dicto"
            },

            body: JSON.stringify({
              message: `Add ${word} to ${level}`,
              content: base64Content,
              sha: githubFile.sha,
              branch: GITHUB_BRANCH
            })
          }
        );

        // -----------------------------
        // 9. ตรวจสอบผลการบันทึก
        // -----------------------------
        if (!updateResponse.ok) {
          const errorText =
            await updateResponse.text();

          return jsonResponse(
            {
              success: false,
              message: "บันทึกลง GitHub ไม่สำเร็จ",
              error: errorText
            },
            500,
            corsHeaders
          );
        }

        const result =
          await updateResponse.json();

        // -----------------------------
        // 10. สำเร็จ
        // -----------------------------
        return jsonResponse(
          {
            success: true,
            message: `เพิ่ม "${word}" ใน ${level} สำเร็จ`,
            word: word,
            level: level,
            commit: result.commit?.html_url || ""
          },
          200,
          corsHeaders
        );

      } catch (error) {
        return jsonResponse(
          {
            success: false,
            message: "เกิดข้อผิดพลาด",
            error: error.message
          },
          500,
          corsHeaders
        );
      }
    }

    // -----------------------------
    // Method อื่น ๆ
    // -----------------------------
    return jsonResponse(
      {
        success: false,
        message: "Method not allowed"
      },
      405,
      corsHeaders
    );
  }
};


// ------------------------------------
// Helper
// ------------------------------------

function jsonResponse(data, status, corsHeaders) {
  return new Response(
    JSON.stringify(data),
    {
      status: status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    }
  );
}
```
