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

    // =============================
    // CORS
    // =============================
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    try {

      // =============================
      // GET
      // =============================
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

      // =============================
      // POST
      // =============================
      if (request.method !== "POST") {
        return jsonResponse(
          {
            success: false,
            message: "Method not allowed"
          },
          405,
          corsHeaders
        );
      }

      const data = await request.json();

      const action = data.action;

      // =============================
      // LOGIN
      // =============================
      if (action === "login") {

        if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
          return jsonResponse(
            {
              success: false,
              message: "ยังไม่ได้ตั้ง ADMIN_USERNAME / ADMIN_PASSWORD ใน Cloudflare"
            },
            500,
            corsHeaders
          );
        }

        if (
          data.username === env.ADMIN_USERNAME &&
          data.password === env.ADMIN_PASSWORD
        ) {

          return jsonResponse(
            {
              success: true,
              username: data.username
            },
            200,
            corsHeaders
          );

        }

        return jsonResponse(
          {
            success: false,
            message: "Username หรือ Password ไม่ถูกต้อง"
          },
          401,
          corsHeaders
        );
      }

      // =============================
      // SESSION
      // =============================
      if (action === "session") {

        return jsonResponse(
          {
            success: false,
            authenticated: false
          },
          200,
          corsHeaders
        );
      }

      // =============================
      // LOGOUT
      // =============================
      if (action === "logout") {

        return jsonResponse(
          {
            success: true
          },
          200,
          corsHeaders
        );
      }

      // =============================
      // LIST
      // =============================
      if (action === "list") {

        const dictionary =
          await getDictionary(env);

        return jsonResponse(
          {
            success: true,
            dictionary
          },
          200,
          corsHeaders
        );
      }

      // =============================
      // ADD
      // =============================
      if (action === "add") {

        const dictionary =
          await getDictionary(env);

        const word =
          String(data.word || "").trim();

        const pinyin =
          String(data.pinyin || "").trim();

        const thaiPronunciation =
          String(
            data.thaiPronunciation || ""
          ).trim();

        const meanings =
          Array.isArray(data.meanings)
            ? data.meanings
            : [];

        const partOfSpeech =
          Array.isArray(data.partOfSpeech)
            ? data.partOfSpeech
            : [];

        const hsk =
          Array.isArray(data.hsk)
            ? data.hsk.map(Number)
            : [];

        const examples =
          Array.isArray(data.examples)
            ? data.examples
            : [];

        if (!word || !pinyin || meanings.length === 0) {
          return jsonResponse(
            {
              success: false,
              message:
                "กรุณากรอกคำศัพท์ Pinyin และความหมาย"
            },
            400,
            corsHeaders
          );
        }

        if (hsk.length === 0) {
          return jsonResponse(
            {
              success: false,
              message: "กรุณาเลือกระดับ HSK"
            },
            400,
            corsHeaders
          );
        }

        // ตรวจคำซ้ำ
        const duplicate =
          dictionary.some(
            item =>
              String(item.word)
                .trim()
                .toLowerCase() ===
              word.toLowerCase()
          );

        if (duplicate) {
          return jsonResponse(
            {
              success: false,
              message:
                `คำว่า "${word}" มีอยู่แล้ว`
            },
            409,
            corsHeaders
          );
        }

        const newWord = {
          id: crypto.randomUUID(),
          word,
          pinyin,
          thaiPronunciation,
          meanings,
          partOfSpeech,
          hsk,
          examples
        };

        dictionary.push(newWord);

        await saveDictionary(
          env,
          dictionary,
          `Add ${word}`
        );

        return jsonResponse(
          {
            success: true,
            message:
              `เพิ่ม "${word}" สำเร็จ`,
            word: newWord
          },
          200,
          corsHeaders
        );
      }

      // =============================
      // UPDATE
      // =============================
      if (action === "update") {

        const dictionary =
          await getDictionary(env);

        const index =
          dictionary.findIndex(
            item => item.id === data.id
          );

        if (index === -1) {
          return jsonResponse(
            {
              success: false,
              message: "ไม่พบคำศัพท์"
            },
            404,
            corsHeaders
          );
        }

        const oldWord =
          dictionary[index];

        const updatedWord = {
          id: oldWord.id,

          word:
            String(data.word || "").trim(),

          pinyin:
            String(data.pinyin || "").trim(),

          thaiPronunciation:
            String(
              data.thaiPronunciation || ""
            ).trim(),

          meanings:
            Array.isArray(data.meanings)
              ? data.meanings
              : [],

          partOfSpeech:
            Array.isArray(data.partOfSpeech)
              ? data.partOfSpeech
              : [],

          hsk:
            Array.isArray(data.hsk)
              ? data.hsk.map(Number)
              : [],

          examples:
            Array.isArray(data.examples)
              ? data.examples
              : []
        };

        if (
          !updatedWord.word ||
          !updatedWord.pinyin ||
          updatedWord.meanings.length === 0
        ) {
          return jsonResponse(
            {
              success: false,
              message:
                "กรุณากรอกข้อมูลให้ครบ"
            },
            400,
            corsHeaders
          );
        }

        dictionary[index] =
          updatedWord;

        await saveDictionary(
          env,
          dictionary,
          `Update ${updatedWord.word}`
        );

        return jsonResponse(
          {
            success: true,
            message:
              `แก้ไข "${updatedWord.word}" สำเร็จ`,
            word: updatedWord
          },
          200,
          corsHeaders
        );
      }

      // =============================
      // DELETE
      // =============================
      if (action === "delete") {

        const dictionary =
          await getDictionary(env);

        const index =
          dictionary.findIndex(
            item => item.id === data.id
          );

        if (index === -1) {
          return jsonResponse(
            {
              success: false,
              message: "ไม่พบคำศัพท์"
            },
            404,
            corsHeaders
          );
        }

        const deletedWord =
          dictionary[index];

        dictionary.splice(index, 1);

        await saveDictionary(
          env,
          dictionary,
          `Delete ${deletedWord.word}`
        );

        return jsonResponse(
          {
            success: true,
            message:
              `ลบ "${deletedWord.word}" สำเร็จ`,
            word: deletedWord
          },
          200,
          corsHeaders
        );
      }

      // =============================
      // UNKNOWN ACTION
      // =============================
      return jsonResponse(
        {
          success: false,
          message:
            "ไม่รู้จัก action นี้"
        },
        400,
        corsHeaders
      );

    } catch (error) {

      return jsonResponse(
        {
          success: false,
          message:
            "เกิดข้อผิดพลาด",
          error:
            error.message
        },
        500,
        corsHeaders
      );
    }
  }
};


// =====================================================
// GET DICTIONARY
// =====================================================

async function getDictionary(env) {

  const url =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`;

  const response =
    await fetch(url, {
      method: "GET",
      headers: {
        "Authorization":
          `Bearer ${env.GITHUB_TOKEN}`,

        "Accept":
          "application/vnd.github+json",

        "X-GitHub-Api-Version":
          "2022-11-28",

        "User-Agent":
          "Mini-Dicto"
      }
    });

  if (!response.ok) {

    const error =
      await response.text();

    throw new Error(
      `GitHub GET error: ${error}`
    );
  }

  const file =
    await response.json();

  const binary =
    atob(
      file.content.replace(/\n/g, "")
    );

  const bytes =
    Uint8Array.from(
      binary,
      char => char.charCodeAt(0)
    );

  const text =
    new TextDecoder().decode(bytes);

  const parsed =
    JSON.parse(text);

  /*
    รองรับทั้งรูปแบบเก่า:

    {
      "HSK1": [],
      "HSK2": []
    }

    และรูปแบบใหม่:

    [
      {...},
      {...}
    ]
  */

  if (Array.isArray(parsed)) {
    return parsed;
  }

  // แปลง HSK1–HSK6 เป็น array เดียว
  const result = [];

  for (const level of [
    "HSK1",
    "HSK2",
    "HSK3",
    "HSK4",
    "HSK5",
    "HSK6"
  ]) {

    if (!Array.isArray(parsed[level])) {
      continue;
    }

    for (const item of parsed[level]) {

      result.push({
        id:
          item.id ||
          crypto.randomUUID(),

        word:
          item.word || "",

        pinyin:
          item.pinyin || "",

        thaiPronunciation:
          item.thaiPronunciation || "",

        meanings:
          Array.isArray(item.meanings)
            ? item.meanings
            : [],

        partOfSpeech:
          Array.isArray(item.partOfSpeech)
            ? item.partOfSpeech
            : item.partOfSpeech
              ? [item.partOfSpeech]
              : [],

        hsk:
          item.hsk ||
          [Number(level.replace("HSK", ""))],

        examples:
          Array.isArray(item.examples)
            ? item.examples
            : []
      });
    }
  }

  return result;
}


// =====================================================
// SAVE DICTIONARY
// =====================================================

async function saveDictionary(
  env,
  dictionary,
  commitMessage
) {

  const url =
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

  // อ่านไฟล์ล่าสุดเพื่อเอา SHA
  const getResponse =
    await fetch(
      `${url}?ref=${GITHUB_BRANCH}`,
      {
        method: "GET",

        headers: {
          "Authorization":
            `Bearer ${env.GITHUB_TOKEN}`,

          "Accept":
            "application/vnd.github+json",

          "X-GitHub-Api-Version":
            "2022-11-28",

          "User-Agent":
            "Mini-Dicto"
        }
      }
    );

  if (!getResponse.ok) {

    const error =
      await getResponse.text();

    throw new Error(
      `GitHub GET error: ${error}`
    );
  }

  const file =
    await getResponse.json();

  // บันทึกเป็น array
  const json =
    JSON.stringify(
      dictionary,
      null,
      2
    );

  const bytes =
    new TextEncoder().encode(json);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const content =
    btoa(binary);

  const updateResponse =
    await fetch(url, {
      method: "PUT",

      headers: {
        "Authorization":
          `Bearer ${env.GITHUB_TOKEN}`,

        "Accept":
          "application/vnd.github+json",

        "Content-Type":
          "application/json",

        "X-GitHub-Api-Version":
          "2022-11-28",

        "User-Agent":
          "Mini-Dicto"
      },

      body: JSON.stringify({
        message:
          commitMessage,

        content,

        sha:
          file.sha,

        branch:
          GITHUB_BRANCH
      })
    });

  if (!updateResponse.ok) {

    const error =
      await updateResponse.text();

    throw new Error(
      `GitHub UPDATE error: ${error}`
    );
  }

  return await updateResponse.json();
}


// =====================================================
// JSON RESPONSE
// =====================================================

function jsonResponse(
  data,
  status,
  corsHeaders
) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        ...corsHeaders,

        "Content-Type":
          "application/json"
      }
    }
  );
}
```
