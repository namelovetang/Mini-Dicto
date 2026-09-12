const DEFAULT_BRANCH = "main";
const SESSION_TTL = 8 * 60 * 60; // 8 ชั่วโมง

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env);

    // =========================
    // CORS
    // =========================
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // =========================
    // GET
    // =========================
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

    // =========================
    // POST
    // =========================
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

    try {
      const data = await request.json();
      const action = data.action;

      // =========================
      // LOGIN
      // =========================
      if (action === "login") {
        return await handleLogin(
          data,
          env,
          corsHeaders
        );
      }

      // =========================
      // SESSION
      // =========================
      if (action === "session") {
        const session = await verifySession(
          request,
          env
        );

        if (!session) {
          return jsonResponse(
            {
              success: false,
              authenticated: false,
              message: "ยังไม่ได้เข้าสู่ระบบ"
            },
            401,
            corsHeaders
          );
        }

        return jsonResponse(
          {
            success: true,
            authenticated: true,
            username: session.username
          },
          200,
          corsHeaders
        );
      }

      // =========================
      // LOGOUT
      // =========================
      if (action === "logout") {
        return jsonResponse(
          {
            success: true,
            message: "ออกจากระบบแล้ว"
          },
          200,
          corsHeaders
        );
      }

      // =========================
      // ทุก action ต่อจากนี้ต้อง Login
      // =========================
      const session = await verifySession(
        request,
        env
      );

      if (!session) {
        return jsonResponse(
          {
            success: false,
            message: "กรุณาเข้าสู่ระบบก่อน"
          },
          401,
          corsHeaders
        );
      }

      // =========================
      // LIST
      // =========================
      if (action === "list") {
        const result = await readDictionary(env);

        return jsonResponse(
          {
            success: true,
            dictionary: result.dictionary
          },
          200,
          corsHeaders
        );
      }

      // =========================
      // ADD
      // =========================
      if (action === "add") {
        return await handleAdd(
          data,
          env,
          corsHeaders
        );
      }

      // =========================
      // UPDATE
      // =========================
      if (action === "update") {
        return await handleUpdate(
          data,
          env,
          corsHeaders
        );
      }

      // =========================
      // DELETE
      // =========================
      if (action === "delete") {
        return await handleDelete(
          data,
          env,
          corsHeaders
        );
      }

      return jsonResponse(
        {
          success: false,
          message: `ไม่รู้จัก action: ${action}`
        },
        400,
        corsHeaders
      );

    } catch (error) {
      console.error(error);

      return jsonResponse(
        {
          success: false,
          message: "เกิดข้อผิดพลาดใน Worker",
          error: error.message
        },
        500,
        corsHeaders
      );
    }
  }
};


// =====================================================
// CORS
// =====================================================

function getCorsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigin =
    env.ALLOWED_ORIGIN ||
    "https://namelovetang.github.io";

  const headers = {
    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",

    "Access-Control-Max-Age":
      "86400"
  };

  if (origin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] =
      allowedOrigin;
  }

  return headers;
}


// =====================================================
// LOGIN
// =====================================================

async function handleLogin(
  data,
  env,
  corsHeaders
) {
  if (
    !env.ADMIN_USERNAME ||
    !env.ADMIN_PASSWORD ||
    !env.ADMIN_SECRET
  ) {
    return jsonResponse(
      {
        success: false,
        message:
          "Cloudflare ยังตั้งค่า ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_SECRET ไม่ครบ"
      },
      500,
      corsHeaders
    );
  }

  const username =
    String(data.username || "").trim();

  const password =
    String(data.password || "");

  if (
    username !== env.ADMIN_USERNAME ||
    password !== env.ADMIN_PASSWORD
  ) {
    return jsonResponse(
      {
        success: false,
        message: "Username หรือ Password ไม่ถูกต้อง"
      },
      401,
      corsHeaders
    );
  }

  const token =
    await createSessionToken(
      username,
      env.ADMIN_SECRET
    );

  return jsonResponse(
    {
      success: true,
      message: "เข้าสู่ระบบสำเร็จ",
      token,
      username
    },
    200,
    corsHeaders
  );
}


// =====================================================
// SESSION TOKEN
// =====================================================

async function createSessionToken(
  username,
  secret
) {
  const payload = {
    username,
    exp:
      Math.floor(Date.now() / 1000) +
      SESSION_TTL
  };

  const payloadString =
    JSON.stringify(payload);

  const payloadBase64 =
    bytesToBase64Url(
      new TextEncoder().encode(
        payloadString
      )
    );

  const signature =
    await createHmac(
      payloadBase64,
      secret
    );

  return `${payloadBase64}.${signature}`;
}


async function verifySession(
  request,
  env
) {
  if (!env.ADMIN_SECRET) {
    return null;
  }

  const authorization =
    request.headers.get(
      "Authorization"
    );

  if (!authorization) {
    return null;
  }

  if (
    !authorization.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }

  const token =
    authorization.substring(7);

  const parts =
    token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const payloadBase64 =
    parts[0];

  const signature =
    parts[1];

  try {
    const expectedSignature =
      await createHmac(
        payloadBase64,
        env.ADMIN_SECRET
      );

    const valid =
      await safeEqual(
        signature,
        expectedSignature
      );

    if (!valid) {
      return null;
    }

    const payloadBytes =
      base64UrlToBytes(
        payloadBase64
      );

    const payload =
      JSON.parse(
        new TextDecoder().decode(
          payloadBytes
        )
      );

    if (
      !payload.exp ||
      payload.exp <
        Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;

  } catch {
    return null;
  }
}


async function createHmac(
  text,
  secret
) {
  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(text)
    );

  return bytesToBase64Url(
    new Uint8Array(signature)
  );
}


async function safeEqual(
  a,
  b
) {
  const aBytes =
    new TextEncoder().encode(a);

  const bBytes =
    new TextEncoder().encode(b);

  if (
    aBytes.length !==
    bBytes.length
  ) {
    return false;
  }

  let result = 0;

  for (
    let i = 0;
    i < aBytes.length;
    i++
  ) {
    result |=
      aBytes[i] ^
      bBytes[i];
  }

  return result === 0;
}


function bytesToBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function base64UrlToBytes(value) {
  let base64 =
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  while (
    base64.length % 4 !== 0
  ) {
    base64 += "=";
  }

  const binary =
    atob(base64);

  return Uint8Array.from(
    binary,
    char => char.charCodeAt(0)
  );
}


// =====================================================
// GITHUB CONFIG
// =====================================================

function getGithubConfig(env) {
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

    branch:
      env.GITHUB_BRANCH ||
      DEFAULT_BRANCH,

    token:
      env.GITHUB_TOKEN
  };
}


// =====================================================
// READ DICTIONARY
// =====================================================

async function readDictionary(env) {
  const config =
    getGithubConfig(env);

  if (!config.token) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า GITHUB_TOKEN"
    );
  }

  const url =
    `https://api.github.com/repos/` +
    `${config.owner}/` +
    `${config.repo}/` +
    `contents/` +
    `${config.file}?ref=${encodeURIComponent(config.branch)}`;

  const response =
    await fetch(url, {
      method: "GET",
      headers: {
        "Authorization":
          `Bearer ${config.token}`,

        "Accept":
          "application/vnd.github+json",

        "X-GitHub-Api-Version":
          "2022-11-28",

        "User-Agent":
          "Mini-Dicto"
      }
    });

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `GitHub อ่าน dictionary.json ไม่สำเร็จ: ${text}`
    );
  }

  const file =
    JSON.parse(text);

  if (!file.content) {
    throw new Error(
      "GitHub ไม่ได้ส่งเนื้อหา dictionary.json กลับมา"
    );
  }

  const binary =
    atob(
      file.content.replace(/\n/g, "")
    );

  const bytes =
    Uint8Array.from(
      binary,
      char =>
        char.charCodeAt(0)
    );

  const decoded =
    new TextDecoder().decode(bytes);

  const parsed =
    JSON.parse(decoded);

  const dictionary =
    normalizeDictionary(parsed);

  return {
    dictionary,
    sha: file.sha
  };
}


// =====================================================
// NORMALIZE DICTIONARY
// =====================================================

function normalizeDictionary(
  parsed
) {
  // รูปแบบใหม่:
  //
  // [
  //   {
  //     id: "...",
  //     word: "...",
  //     hsk: [1]
  //   }
  // ]

  if (Array.isArray(parsed)) {
    return parsed.map(
      item =>
        normalizeWord(item)
    );
  }


  // รองรับรูปแบบเก่า:
  //
  // {
  //   "1": [...],
  //   "2": [...],
  //   "3": [...]
  // }

  if (
    parsed &&
    typeof parsed === "object"
  ) {
    const result = [];

    for (
      const [key, items]
      of Object.entries(parsed)
    ) {
      if (
        !Array.isArray(items)
      ) {
        continue;
      }

      const level =
        Number(
          String(key)
            .replace(/^HSK/i, "")
        );

      if (
        !Number.isInteger(level) ||
        level < 1 ||
        level > 6
      ) {
        continue;
      }

      for (
        const item of items
      ) {
        result.push(
          normalizeWord(
            item,
            level
          )
        );
      }
    }

    return result;
  }

  return [];
}


// =====================================================
// NORMALIZE WORD
// =====================================================

function normalizeWord(
  item,
  fallbackLevel = null
) {
  const hsk =
    normalizeHsk(
      item?.hsk ??
      fallbackLevel
    );

  let id =
    item?.id;

  if (!id) {
    id =
      createFallbackId(
        item?.word || "",
        hsk
      );
  }

  return {
    id,

    word:
      String(
        item?.word || ""
      ),

    pinyin:
      String(
        item?.pinyin || ""
      ),

    thaiPronunciation:
      String(
        item?.thaiPronunciation ||
        ""
      ),

    meanings:
      Array.isArray(
        item?.meanings
      )
        ? item.meanings
        : item?.meanings
          ? [String(item.meanings)]
          : [],

    partOfSpeech:
      Array.isArray(
        item?.partOfSpeech
      )
        ? item.partOfSpeech
        : item?.partOfSpeech
          ? [String(item.partOfSpeech)]
          : [],

    hsk,

    examples:
      Array.isArray(
        item?.examples
      )
        ? item.examples
        : []
  };
}


function normalizeHsk(value) {
  if (Array.isArray(value)) {
    return value
      .map(Number)
      .filter(
        level =>
          Number.isInteger(level) &&
          level >= 1 &&
          level <= 6
      );
  }

  if (
    value !== undefined &&
    value !== null &&
    value !== ""
  ) {
    const level =
      Number(value);

    if (
      Number.isInteger(level) &&
      level >= 1 &&
      level <= 6
    ) {
      return [level];
    }
  }

  return [];
}


function createFallbackId(
  word,
  hsk
) {
  return encodeURIComponent(
    `${word}|${hsk.join(",")}`
  );
}


// =====================================================
// SAVE DICTIONARY TO GITHUB
// =====================================================

async function saveDictionary(
  dictionary,
  sha,
  message,
  env
) {
  const config =
    getGithubConfig(env);

  const url =
    `https://api.github.com/repos/` +
    `${config.owner}/` +
    `${config.repo}/` +
    `contents/` +
    `${config.file}`;

  const json =
    JSON.stringify(
      dictionary,
      null,
      2
    );

  const bytes =
    new TextEncoder().encode(json);

  let binary = "";

  for (
    const byte of bytes
  ) {
    binary += String.fromCharCode(
      byte
    );
  }

  const base64Content =
    btoa(binary);

  const response =
    await fetch(url, {
      method: "PUT",

      headers: {
        "Authorization":
          `Bearer ${config.token}`,

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
        message,
        content:
          base64Content,

        sha,

        branch:
          config.branch
      })
    });

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `GitHub บันทึกไม่สำเร็จ: ${text}`
    );
  }

  return JSON.parse(text);
}


// =====================================================
// ADD
// =====================================================

async function handleAdd(
  data,
  env,
  corsHeaders
) {
  const word =
    String(
      data.word || ""
    ).trim();

  const pinyin =
    String(
      data.pinyin || ""
    ).trim();

  const thaiPronunciation =
    String(
      data.thaiPronunciation || ""
    ).trim();

  const meanings =
    Array.isArray(data.meanings)
      ? data.meanings
      : [];

  const partOfSpeech =
    Array.isArray(
      data.partOfSpeech
    )
      ? data.partOfSpeech
      : [];

  const hsk =
    normalizeHsk(data.hsk);

  const examples =
    Array.isArray(data.examples)
      ? data.examples
      : [];


  if (!word) {
    return jsonResponse(
      {
        success: false,
        message:
          "กรุณากรอกคำศัพท์"
      },
      400,
      corsHeaders
    );
  }


  if (!pinyin) {
    return jsonResponse(
      {
        success: false,
        message:
          "กรุณากรอก Pinyin"
      },
      400,
      corsHeaders
    );
  }


  if (
    meanings.length === 0
  ) {
    return jsonResponse(
      {
        success: false,
        message:
          "กรุณากรอกความหมาย"
      },
      400,
      corsHeaders
    );
  }


  if (
    hsk.length === 0
  ) {
    return jsonResponse(
      {
        success: false,
        message:
          "กรุณาเลือกระดับ HSK"
      },
      400,
      corsHeaders
    );
  }


  const result =
    await readDictionary(env);

  const dictionary =
    result.dictionary;


  const duplicate =
    dictionary.some(item =>
      item.word === word &&
      item.hsk.some(
        level =>
          hsk.includes(level)
      )
    );


  if (duplicate) {
    return jsonResponse(
      {
        success: false,
        message:
          `คำว่า "${word}" มีอยู่แล้วใน HSK ที่เลือก`
      },
      409,
      corsHeaders
    );
  }


  const newWord = {
    id:
      crypto.randomUUID(),

    word,

    pinyin,

    thaiPronunciation,

    meanings,

    partOfSpeech,

    hsk,

    examples
  };


  dictionary.push(
    newWord
  );


  await saveDictionary(
    dictionary,
    result.sha,
    `Add ${word}`,
    env
  );


  return jsonResponse(
    {
      success: true,
      message:
        `เพิ่ม "${word}" สำเร็จ`,
      word:
        newWord
    },
    200,
    corsHeaders
  );
}


// =====================================================
// UPDATE
// =====================================================

async function handleUpdate(
  data,
  env,
  corsHeaders
) {
  const id =
    String(
      data.id || ""
    );

  if (!id) {
    return jsonResponse(
      {
        success: false,
        message:
          "ไม่พบ ID ของคำศัพท์"
      },
      400,
      corsHeaders
    );
  }


  const result =
    await readDictionary(env);

  const dictionary =
    result.dictionary;


  const index =
    dictionary.findIndex(
      item =>
        item.id === id
    );


  if (index === -1) {
    return jsonResponse(
      {
        success: false,
        message:
          "ไม่พบคำศัพท์ที่ต้องการแก้ไข"
      },
      404,
      corsHeaders
    );
  }


  const oldWord =
    dictionary[index];


  const word =
    String(
      data.word || ""
    ).trim();

  const pinyin =
    String(
      data.pinyin || ""
    ).trim();

  const thaiPronunciation =
    String(
      data.thaiPronunciation || ""
    ).trim();

  const meanings =
    Array.isArray(data.meanings)
      ? data.meanings
      : [];

  const partOfSpeech =
    Array.isArray(
      data.partOfSpeech
    )
      ? data.partOfSpeech
      : [];

  const hsk =
    normalizeHsk(data.hsk);

  const examples =
    Array.isArray(data.examples)
      ? data.examples
      : [];


  if (
    !word ||
    !pinyin ||
    meanings.length === 0 ||
    hsk.length === 0
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


  const duplicate =
    dictionary.some(
      (item, itemIndex) =>
        itemIndex !== index &&
        item.word === word &&
        item.hsk.some(
          level =>
            hsk.includes(level)
        )
    );


  if (duplicate) {
    return jsonResponse(
      {
        success: false,
        message:
          `คำว่า "${word}" มีอยู่แล้วใน HSK ที่เลือก`
      },
      409,
      corsHeaders
    );
  }


  const updatedWord = {
    id:
      oldWord.id,

    word,

    pinyin,

    thaiPronunciation,

    meanings,

    partOfSpeech,

    hsk,

    examples
  };


  dictionary[index] =
    updatedWord;


  await saveDictionary(
    dictionary,
    result.sha,
    `Update ${word}`,
    env
  );


  return jsonResponse(
    {
      success: true,
      message:
        `แก้ไข "${word}" สำเร็จ`,
      word:
        updatedWord
    },
    200,
    corsHeaders
  );
}


// =====================================================
// DELETE
// =====================================================

async function handleDelete(
  data,
  env,
  corsHeaders
) {
  const id =
    String(
      data.id || ""
    );


  if (!id) {
    return jsonResponse(
      {
        success: false,
        message:
          "ไม่พบ ID"
      },
      400,
      corsHeaders
    );
  }


  const result =
    await readDictionary(env);

  const dictionary =
    result.dictionary;


  const index =
    dictionary.findIndex(
      item =>
        item.id === id
    );


  if (index === -1) {
    return jsonResponse(
      {
        success: false,
        message:
          "ไม่พบคำศัพท์ที่ต้องการลบ"
      },
      404,
      corsHeaders
    );
  }


  const deletedWord =
    dictionary[index];


  dictionary.splice(
    index,
    1
  );


  await saveDictionary(
    dictionary,
    result.sha,
    `Delete ${deletedWord.word}`,
    env
  );


  return jsonResponse(
    {
      success: true,
      message:
        `ลบ "${deletedWord.word}" สำเร็จ`,
      word:
        deletedWord
    },
    200,
    corsHeaders
  );
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
