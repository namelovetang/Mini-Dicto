const BRANCH = "main";

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    // =========================
    // CORS PREFLIGHT
    // =========================
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: cors,
      });
    }

    try {
      // =========================
      // HEALTH CHECK
      // =========================
      if (request.method === "GET") {
        return json(
          {
            success: true,
            message: "Mini-Dicto API is running",
          },
          200,
          cors
        );
      }

      // =========================
      // ONLY POST
      // =========================
      if (request.method !== "POST") {
        return json(
          {
            success: false,
            message: "Method not allowed",
          },
          405,
          cors
        );
      }

      const body = await request.json();
      const action = String(body.action || "");

      // =====================================================
      // LOGIN
      // =====================================================

      if (action === "login") {
        const username = String(body.username || "");
        const password = String(body.password || "");

        if (
          username !== String(env.ADMIN_USERNAME || "") ||
          password !== String(env.ADMIN_PASSWORD || "")
        ) {
          return json(
            {
              success: false,
              message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
            },
            401,
            cors
          );
        }

        const token = await createToken(
          username,
          String(env.ADMIN_SECRET || "")
        );

        return json(
          {
            success: true,
            token,
            username,
          },
          200,
          cors
        );
      }

      // =====================================================
      // AUTHENTICATION
      // =====================================================

      const token = getBearerToken(request);

      if (!token) {
        return json(
          {
            success: false,
            authenticated: false,
            message: "กรุณาเข้าสู่ระบบ",
          },
          401,
          cors
        );
      }

      const auth = await verifyToken(
        token,
        String(env.ADMIN_SECRET || "")
      );

      if (!auth.valid) {
        return json(
          {
            success: false,
            authenticated: false,
            message: "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
          },
          401,
          cors
        );
      }

      // =====================================================
      // SESSION
      // =====================================================

      if (action === "session") {
        return json(
          {
            success: true,
            authenticated: true,
            username: auth.username,
          },
          200,
          cors
        );
      }

      // =====================================================
      // LOGOUT
      // =====================================================

      if (action === "logout") {
        return json(
          {
            success: true,
          },
          200,
          cors
        );
      }

      // =====================================================
      // LIST
      // =====================================================

      if (action === "list") {
        const dictionary = await loadDictionary(env);

        return json(
          {
            success: true,
            dictionary,
          },
          200,
          cors
        );
      }

      // =====================================================
      // AI ADD WORD
      // =====================================================

      if (action === "ai_add") {
        const word = String(body.word || "").trim();

        if (!word) {
          return json(
            {
              success: false,
              message: "กรุณากรอกคำศัพท์จีน",
            },
            400,
            cors
          );
        }

        if (!env.OPENAI_API_KEY) {
          return json(
            {
              success: false,
              message: "ยังไม่ได้ตั้งค่า OPENAI_API_KEY ใน Cloudflare",
            },
            500,
            cors
          );
        }

        // -------------------------------------------------
        // เรียก OpenAI
        // -------------------------------------------------

        const aiResponse = await fetch(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              Authorization:
                `Bearer ${env.OPENAI_API_KEY}`,
            },

            body: JSON.stringify({
              model: "gpt-5.6-luna",

              input: `
คุณเป็นผู้เชี่ยวชาญด้านภาษาจีนและการทำพจนานุกรมจีน-ไทย

สร้างข้อมูลคำศัพท์สำหรับ Mini-Dicto

คำศัพท์จีน:
${word}

ให้ตอบเป็น JSON object เพียงอย่างเดียว
ห้ามใช้ Markdown
ห้ามใช้ code fence
ห้ามใส่คำอธิบายก่อนหรือหลัง JSON

รูปแบบ JSON:

{
  "word": "",
  "pinyin": "",
  "thaiPronunciation": "",
  "meanings": [],
  "partOfSpeech": [],
  "hsk": [],
  "examples": [
    {
      "chinese": "",
      "pinyin": "",
      "thai": ""
    },
    {
      "chinese": "",
      "pinyin": "",
      "thai": ""
    },
    {
      "chinese": "",
      "pinyin": "",
      "thai": ""
    }
  ]
}

กฎ:

1. word ต้องเป็นคำจีนที่ผู้ใช้ส่งมา
2. pinyin ต้องถูกต้องและมีวรรณยุกต์
3. thaiPronunciation ต้องเป็นคำอ่านภาษาไทยที่คนไทยอ่านตามได้
4. meanings ต้องเป็น array ของความหมายภาษาไทย
5. partOfSpeech ต้องเป็น array เช่น ["名词"] หรือ ["动词"]
6. hsk ต้องเป็น array เช่น [1] หรือ [1,2]
7. ถ้าไม่อยู่ใน HSK 1-6 ให้ใช้ []
8. examples ต้องมี 3 ประโยค
9. ทุก example ต้องมี chinese, pinyin และ thai
10. ประโยคต้องใช้คำศัพท์เป้าหมายอย่างถูกต้อง
11. ประโยคควรเหมาะกับผู้เรียนภาษาจีน
12. อย่าสร้างข้อมูลที่ไม่แน่ใจ
13. ห้ามใส่ id เพราะระบบจะสร้าง id ให้เอง
`,
            }),
          }
        );

        if (!aiResponse.ok) {
          const errorText =
            await aiResponse.text();

          console.error(
            "OpenAI error:",
            errorText
          );

          return json(
            {
              success: false,
              message:
                "OpenAI API เกิดข้อผิดพลาด",
              detail: errorText,
            },
            502,
            cors
          );
        }

        const aiData =
          await aiResponse.json();

        // -------------------------------------------------
        // ดึงข้อความจาก Responses API
        // -------------------------------------------------

        const output =
          extractOpenAIText(aiData);

        if (!output) {
          return json(
            {
              success: false,
              message:
                "OpenAI ไม่ได้ส่งข้อมูลกลับมา",
            },
            502,
            cors
          );
        }

        // -------------------------------------------------
        // แปลง JSON
        // -------------------------------------------------

        let aiWord;

        try {
          aiWord =
            JSON.parse(cleanJsonText(output));
        } catch (error) {
          console.error(
            "AI JSON parse error:",
            output
          );

          return json(
            {
              success: false,
              message:
                "AI ส่งข้อมูลกลับมาไม่ถูกต้อง",
            },
            502,
            cors
          );
        }

        // -------------------------------------------------
        // ตรวจข้อมูล
        // -------------------------------------------------

        if (!aiWord.word) {
          return json(
            {
              success: false,
              message:
                "AI ไม่ได้สร้างคำศัพท์",
            },
            502,
            cors
          );
        }

        // ใช้คำที่ผู้ใช้ส่งมาเป็นหลัก
        aiWord.word = word;

        // -------------------------------------------------
        // โหลด dictionary เดิม
        // -------------------------------------------------

        const dictionary =
          await loadDictionary(env);

        // -------------------------------------------------
        // normalize ก่อนตรวจ duplicate
        // -------------------------------------------------

        const newWord =
          normalizeWord(aiWord);

        // -------------------------------------------------
        // ตรวจคำซ้ำ
        // -------------------------------------------------

        const duplicate =
          dictionary.some(
            (item) =>
              item.word === newWord.word &&
              (
                newWord.hsk.length === 0 ||
                item.hsk.some((level) =>
                  newWord.hsk.includes(level)
                )
              )
          );

        if (duplicate) {
          return json(
            {
              success: false,
              message:
                `มีคำว่า ${newWord.word} อยู่ใน dictionary.json แล้ว`,
              word: newWord,
            },
            409,
            cors
          );
        }

        // -------------------------------------------------
        // สร้าง ID ตัวเลขถัดไป
        // -------------------------------------------------

        const maxId =
          dictionary.reduce(
            (max, item) => {
              const id =
                Number(item.id);

              if (
                Number.isInteger(id)
              ) {
                return Math.max(
                  max,
                  id
                );
              }

              return max;
            },
            0
          );

        newWord.id = maxId + 1;

        // -------------------------------------------------
        // เพิ่มคำศัพท์
        // -------------------------------------------------

        dictionary.push(newWord);

        // -------------------------------------------------
        // บันทึกลง GitHub
        // -------------------------------------------------

        await saveDictionary(
          env,
          dictionary,
          `AI Add word: ${newWord.word}`
        );

        return json(
          {
            success: true,
            message:
              `เพิ่มคำว่า ${newWord.word} สำเร็จ`,
            word: newWord,
          },
          200,
          cors
        );
      }

      // =====================================================
      // NORMAL ADD
      // =====================================================

      if (action === "add") {
        const dictionary =
          await loadDictionary(env);

        const newWord =
          normalizeWord({
            ...body,
            id: crypto.randomUUID(),
          });

        if (!newWord.word) {
          return json(
            {
              success: false,
              message: "กรุณากรอกคำศัพท์",
            },
            400,
            cors
          );
        }

        if (newWord.hsk.length === 0) {
          return json(
            {
              success: false,
              message: "กรุณาเลือกระดับ HSK",
            },
            400,
            cors
          );
        }

        const duplicate =
          dictionary.some(
            (item) =>
              item.word === newWord.word &&
              item.hsk.some((level) =>
                newWord.hsk.includes(level)
              )
          );

        if (duplicate) {
          return json(
            {
              success: false,
              message:
                "มีคำศัพท์นี้ในระดับ HSK นี้แล้ว",
            },
            409,
            cors
          );
        }

        dictionary.push(newWord);

        await saveDictionary(
          env,
          dictionary,
          `Add word: ${newWord.word}`
        );

        return json(
          {
            success: true,
            word: newWord,
          },
          200,
          cors
        );
      }

      // =====================================================
      // UPDATE
      // =====================================================

      if (action === "update") {
        const dictionary =
          await loadDictionary(env);

        const id =
          String(body.id || "");

        if (!id) {
          return json(
            {
              success: false,
              message:
                "ไม่พบ ID ของคำศัพท์",
            },
            400,
            cors
          );
        }

        const index =
          dictionary.findIndex(
            (item) =>
              String(item.id) === id
          );

        if (index === -1) {
          return json(
            {
              success: false,
              message:
                "ไม่พบคำศัพท์ที่ต้องการแก้ไข",
            },
            404,
            cors
          );
        }

        const updatedWord =
          normalizeWord({
            ...body,
            id,
          });

        if (!updatedWord.word) {
          return json(
            {
              success: false,
              message:
                "กรุณากรอกคำศัพท์",
            },
            400,
            cors
          );
        }

        if (updatedWord.hsk.length === 0) {
          return json(
            {
              success: false,
              message:
                "กรุณาเลือกระดับ HSK",
            },
            400,
            cors
          );
        }

        const duplicate =
          dictionary.some(
            (item, i) =>
              i !== index &&
              item.word === updatedWord.word &&
              item.hsk.some((level) =>
                updatedWord.hsk.includes(level)
              )
          );

        if (duplicate) {
          return json(
            {
              success: false,
              message:
                "มีคำศัพท์นี้ในระดับ HSK นี้แล้ว",
            },
            409,
            cors
          );
        }

        dictionary[index] =
          updatedWord;

        await saveDictionary(
          env,
          dictionary,
          `Update word: ${updatedWord.word}`
        );

        return json(
          {
            success: true,
            word: updatedWord,
          },
          200,
          cors
        );
      }

      // =====================================================
      // DELETE
      // =====================================================

      if (action === "delete") {
        const dictionary =
          await loadDictionary(env);

        const id =
          String(body.id || "");

        if (!id) {
          return json(
            {
              success: false,
              message:
                "ไม่พบ ID ของคำศัพท์",
            },
            400,
            cors
          );
        }

        const index =
          dictionary.findIndex(
            (item) =>
              String(item.id) === id
          );

        if (index === -1) {
          return json(
            {
              success: false,
              message:
                "ไม่พบคำศัพท์ที่ต้องการลบ",
            },
            404,
            cors
          );
        }

        const deleted =
          dictionary[index];

        dictionary.splice(index, 1);

        await saveDictionary(
          env,
          dictionary,
          `Delete word: ${deleted.word}`
        );

        return json(
          {
            success: true,
            word: deleted,
          },
          200,
          cors
        );
      }

      // =====================================================
      // UNKNOWN ACTION
      // =====================================================

      return json(
        {
          success: false,
          message:
            "ไม่รู้จัก action: " + action,
        },
        400,
        cors
      );

    } catch (error) {
      console.error(error);

      return json(
        {
          success: false,
          message:
            error.message ||
            "เกิดข้อผิดพลาดใน Server",
        },
        500,
        cors
      );
    }
  },
};


// =====================================================
// CORS
// =====================================================

function corsHeaders(request, env) {
  const origin =
    request.headers.get("Origin") || "";

  const allowed =
    String(
      env.ALLOWED_ORIGIN || "*"
    );

  const allowOrigin =
    allowed === "*" ||
    origin === allowed
      ? allowed
      : "";

  return {
    ...(allowOrigin
      ? {
          "Access-Control-Allow-Origin":
            allowOrigin,
        }
      : {}),

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",

    "Access-Control-Max-Age":
      "86400",

    Vary: "Origin",

    "Content-Type":
      "application/json; charset=utf-8",
  };
}


// =====================================================
// JSON RESPONSE
// =====================================================

function json(
  data,
  status = 200,
  cors = {}
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...cors,
        "Content-Type":
          "application/json; charset=utf-8",
      },
    }
  );
}


// =====================================================
// AUTH
// =====================================================

function getBearerToken(request) {
  const header =
    request.headers.get(
      "Authorization"
    ) || "";

  if (
    !header.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }

  return header
    .slice(7)
    .trim();
}


async function createToken(
  username,
  secret
) {
  const payload = {
    u: username,
    exp:
      Math.floor(
        Date.now() / 1000
      ) +
      8 * 60 * 60,
  };

  const payload64 =
    base64urlEncode(
      new TextEncoder().encode(
        JSON.stringify(payload)
      )
    );

  const signature =
    await signHmac(
      payload64,
      secret
    );

  return `${payload64}.${signature}`;
}


async function verifyToken(
  token,
  secret
) {
  try {
    const parts =
      token.split(".");

    if (parts.length !== 2) {
      return {
        valid: false,
      };
    }

    const [
      payload64,
      signature,
    ] = parts;

    const expected =
      await signHmac(
        payload64,
        secret
      );

    if (
      !constantTimeEqual(
        signature,
        expected
      )
    ) {
      return {
        valid: false,
      };
    }

    const payload =
      JSON.parse(
        new TextDecoder().decode(
          base64urlDecode(
            payload64
          )
        )
      );

    if (
      !payload.u ||
      !payload.exp
    ) {
      return {
        valid: false,
      };
    }

    if (
      Number(payload.exp) <
      Math.floor(
        Date.now() / 1000
      )
    ) {
      return {
        valid: false,
      };
    }

    return {
      valid: true,
      username: payload.u,
    };

  } catch {
    return {
      valid: false,
    };
  }
}


async function signHmac(
  text,
  secret
) {
  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(
        secret
      ),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(
        text
      )
    );

  return base64urlEncode(
    new Uint8Array(
      signature
    )
  );
}


function constantTimeEqual(
  a,
  b
) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    result |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }

  return result === 0;
}


// =====================================================
// BASE64URL
// =====================================================

function base64urlEncode(
  bytes
) {
  let binary = "";

  for (const byte of bytes) {
    binary +=
      String.fromCharCode(
        byte
      );
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function base64urlDecode(
  text
) {
  let base64 =
    text
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  while (
    base64.length % 4
  ) {
    base64 += "=";
  }

  const binary =
    atob(base64);

  return Uint8Array.from(
    binary,
    (char) =>
      char.charCodeAt(0)
  );
}


// =====================================================
// GITHUB
// =====================================================

function githubConfig(env) {
  return {
    owner:
      env.GITHUB_OWNER ||
      "namelovetang",

    repo:
      env.GITHUB_REPO ||
      "Mini-Dicto",

    file:
      env.GITHUB_FILE ||
      "dictionary.json",

    branch: BRANCH,
  };
}


function githubHeaders(env) {
  return {
    Authorization:
      `Bearer ${env.GITHUB_TOKEN}`,

    Accept:
      "application/vnd.github+json",

    "X-GitHub-Api-Version":
      "2022-11-28",

    "User-Agent":
      "Mini-Dicto",
  };
}


async function getGithubFile(env) {
  const config =
    githubConfig(env);

  const url =
    `https://api.github.com/repos/` +
    `${config.owner}/` +
    `${config.repo}/` +
    `contents/` +
    `${encodeURIComponent(
      config.file
    )}` +
    `?ref=${encodeURIComponent(
      config.branch
    )}`;

  const response =
    await fetch(url, {
      method: "GET",
      headers:
        githubHeaders(env),
    });

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `GitHub GET failed (${response.status}): ${text}`
    );
  }

  return await response.json();
}


// =====================================================
// LOAD DICTIONARY
// =====================================================

async function loadDictionary(env) {
  const file =
    await getGithubFile(env);

  if (!file.content) {
    throw new Error(
      "ไม่พบ content ของ dictionary.json"
    );
  }

  const bytes =
    base64ToBytes(
      file.content
    );

  const text =
    new TextDecoder().decode(
      bytes
    );

  return parseDictionary(text);
}


// =====================================================
// SAVE DICTIONARY
// =====================================================

async function saveDictionary(
  env,
  dictionary,
  message
) {
  const config =
    githubConfig(env);

  // อ่าน SHA ล่าสุดก่อนเขียน
  const file =
    await getGithubFile(env);

  const cleanDictionary =
    dictionary.map(
      normalizeWord
    );

  const text =
    JSON.stringify(
      cleanDictionary,
      null,
      2
    ) + "\n";

  const bytes =
    new TextEncoder().encode(
      text
    );

  const content =
    bytesToBase64(bytes);

  const url =
    `https://api.github.com/repos/` +
    `${config.owner}/` +
    `${config.repo}/` +
    `contents/` +
    `${encodeURIComponent(
      config.file
    )}`;

  const response =
    await fetch(url, {
      method: "PUT",

      headers: {
        ...githubHeaders(env),

        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        message,
        content,
        sha: file.sha,
        branch:
          config.branch,
      }),
    });

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `GitHub PUT failed (${response.status}): ${text}`
    );
  }

  return await response.json();
}


// =====================================================
// DICTIONARY PARSER
// =====================================================

function parseDictionary(text) {
  const parsed =
    JSON.parse(text);

  // New format
  if (Array.isArray(parsed)) {
    return parsed.map(
      (item) =>
        normalizeWord(item)
    );
  }

  // Legacy format
  const flat = [];

  if (
    parsed &&
    typeof parsed === "object"
  ) {
    for (
      const [
        key,
        items,
      ] of Object.entries(
        parsed
      )
    ) {
      const match =
        String(key).match(
          /\d+/
        );

      const level =
        match
          ? Number(match[0])
          : null;

      if (
        !Array.isArray(items) ||
        !level
      ) {
        continue;
      }

      for (
        const item of items
      ) {
        flat.push(
          normalizeWord(
            item,
            level
          )
        );
      }
    }
  }

  return flat;
}


// =====================================================
// NORMALIZE WORD
// =====================================================

function normalizeWord(
  item,
  fallbackHsk = null
) {
  item =
    item || {};

  const word =
    String(
      item.word ?? ""
    ).trim();

  const rawHsk =
    item.hsk ??
    fallbackHsk;

  let hsk = [];

  if (Array.isArray(rawHsk)) {
    hsk =
      rawHsk
        .map(Number)
        .filter(
          (n) =>
            Number.isInteger(n) &&
            n >= 1 &&
            n <= 6
        );
  } else if (
    rawHsk !== null &&
    rawHsk !== undefined &&
    rawHsk !== ""
  ) {
    const n =
      Number(rawHsk);

    if (
      Number.isInteger(n) &&
      n >= 1 &&
      n <= 6
    ) {
      hsk = [n];
    }
  }

  const id =
    item.id ??
    encodeURIComponent(
      `${word}|${hsk.join("-")}`
    );

  return {
    id,

    word,

    pinyin:
      String(
        item.pinyin ?? ""
      ).trim(),

    thaiPronunciation:
      String(
        item.thaiPronunciation ??
        ""
      ).trim(),

    meanings:
      Array.isArray(
        item.meanings
      )
        ? item.meanings
            .map(String)
            .map(
              (x) =>
                x.trim()
            )
            .filter(Boolean)
        : item.meanings
          ? String(
              item.meanings
            )
              .split(",")
              .map(
                (x) =>
                  x.trim()
              )
              .filter(Boolean)
          : [],

    partOfSpeech:
      Array.isArray(
        item.partOfSpeech
      )
        ? item.partOfSpeech
            .map(String)
            .map(
              (x) =>
                x.trim()
            )
            .filter(Boolean)
        : item.partOfSpeech
          ? [
              String(
                item.partOfSpeech
              ),
            ]
          : [],

    hsk,

    examples:
      Array.isArray(
        item.examples
      )
        ? item.examples.map(
            normalizeExample
          )
        : [],
  };
}


// =====================================================
// NORMALIZE EXAMPLE
// =====================================================

function normalizeExample(
  example
) {
  example =
    example || {};

  return {
    chinese:
      String(
        example.chinese ??
        example.zh ??
        ""
      ).trim(),

    pinyin:
      String(
        example.pinyin ??
        ""
      ).trim(),

    thai:
      String(
        example.thai ??
        example.th ??
        ""
      ).trim(),
  };
}


// =====================================================
// OPENAI OUTPUT
// =====================================================

function extractOpenAIText(
  data
) {
  // Responses API มี output_text ใน SDK
  if (
    typeof data.output_text ===
    "string"
  ) {
    return data.output_text;
  }

  // Fallback สำหรับ raw API response
  if (
    Array.isArray(data.output)
  ) {
    for (
      const item of data.output
    ) {
      if (
        Array.isArray(
          item.content
        )
      ) {
        for (
          const content
          of item.content
        ) {
          if (
            typeof content.text ===
            "string"
          ) {
            return content.text;
          }
        }
      }
    }
  }

  return "";
}


// =====================================================
// CLEAN AI JSON
// =====================================================

function cleanJsonText(
  text
) {
  let result =
    String(text).trim();

  // ลบ ```json ... ```
  result =
    result.replace(
      /^```json\s*/i,
      ""
    );

  result =
    result.replace(
      /^```\s*/i,
      ""
    );

  result =
    result.replace(
      /\s*```$/i,
      ""
    );

  return result.trim();
}


// =====================================================
// BASE64 FOR GITHUB
// =====================================================

function bytesToBase64(
  bytes
) {
  let binary = "";

  for (
    const byte of bytes
  ) {
    binary +=
      String.fromCharCode(
        byte
      );
  }

  return btoa(binary);
}


function base64ToBytes(
  base64
) {
  const binary =
    atob(
      base64.replace(
        /\n/g,
        ""
      )
    );

  return Uint8Array.from(
    binary,
    (char) =>
      char.charCodeAt(0)
  );
}
