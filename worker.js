const SESSION_NAME = "mini_dicto_session";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 ชั่วโมง

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // =========================
      // CORS
      // =========================
      const origin = request.headers.get("Origin");
      const allowedOrigin = env.ALLOWED_ORIGIN;

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(origin, allowedOrigin)
        });
      }

      // =========================
      // LOGIN
      // =========================
      if (url.pathname === "/login" && request.method === "POST") {
        return await login(request, env);
      }

      // =========================
      // LOGOUT
      // =========================
      if (url.pathname === "/logout" && request.method === "POST") {
        return logout(origin, allowedOrigin);
      }

      // =========================
      // CHECK LOGIN
      // =========================
      if (url.pathname === "/me" && request.method === "GET") {
        const session = await getSession(request, env);

        return jsonResponse(
          {
            loggedIn: !!session
          },
          200,
          origin,
          allowedOrigin
        );
      }

      // =========================
      // ทุก endpoint ต่อจากนี้ต้อง Login
      // =========================
      const session = await getSession(request, env);

      if (!session) {
        return jsonResponse(
          {
            success: false,
            message: "ไม่ได้เข้าสู่ระบบ"
          },
          401,
          origin,
          allowedOrigin
        );
      }

      // =========================
      // GET DICTIONARY
      // =========================
      if (url.pathname === "/dictionary" && request.method === "GET") {
        return await getDictionary(env, origin, allowedOrigin);
      }

      // =========================
      // ADD WORD
      // =========================
      if (url.pathname === "/dictionary" && request.method === "POST") {
        return await addWord(request, env, origin, allowedOrigin);
      }

      // =========================
      // UPDATE WORD
      // =========================
      if (url.pathname === "/dictionary" && request.method === "PUT") {
        return await updateWord(request, env, origin, allowedOrigin);
      }

      // =========================
      // DELETE WORD
      // =========================
      if (url.pathname === "/dictionary" && request.method === "DELETE") {
        return await deleteWord(request, env, origin, allowedOrigin);
      }

      return jsonResponse(
        {
          success: false,
          message: "ไม่พบ API นี้"
        },
        404,
        origin,
        allowedOrigin
      );

    } catch (error) {
      console.error(error);

      return new Response(
        JSON.stringify({
          success: false,
          message: "เกิดข้อผิดพลาดที่ Server",
          error: error.message
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=UTF-8"
          }
        }
      );
    }
  }
};


// =====================================================
// CORS
// =====================================================

function corsHeaders(origin, allowedOrigin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400"
  };

  if (origin && origin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}


// =====================================================
// JSON RESPONSE
// =====================================================

function jsonResponse(data, status, origin, allowedOrigin, extraHeaders = {}) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        ...corsHeaders(origin, allowedOrigin),
        ...extraHeaders
      }
    }
  );
}


// =====================================================
// LOGIN
// =====================================================

async function login(request, env) {
  const origin = request.headers.get("Origin");

  if (origin !== env.ALLOWED_ORIGIN) {
    return jsonResponse(
      {
        success: false,
        message: "Origin ไม่ได้รับอนุญาต"
      },
      403,
      origin,
      env.ALLOWED_ORIGIN
    );
  }

  const body = await request.json();

  const username = String(body.username || "");
  const password = String(body.password || "");

  if (
    username !== env.ADMIN_USERNAME ||
    password !== env.ADMIN_PASSWORD
  ) {
    return jsonResponse(
      {
        success: false,
        message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
      },
      401,
      origin,
      env.ALLOWED_ORIGIN
    );
  }

  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;

  const sessionData = {
    username,
    expiresAt
  };

  const session = await createSignedSession(
    sessionData,
    env.ADMIN_SECRET
  );

  return jsonResponse(
    {
      success: true,
      message: "เข้าสู่ระบบสำเร็จ"
    },
    200,
    origin,
    env.ALLOWED_ORIGIN,
    {
      "Set-Cookie":
        `${SESSION_NAME}=${session}; ` +
        `Max-Age=${SESSION_MAX_AGE}; ` +
        `Path=/; ` +
        `HttpOnly; ` +
        `Secure; ` +
        `SameSite=None`
    }
  );
}


// =====================================================
// LOGOUT
// =====================================================

function logout(origin, allowedOrigin) {
  return jsonResponse(
    {
      success: true,
      message: "ออกจากระบบแล้ว"
    },
    200,
    origin,
    allowedOrigin,
    {
      "Set-Cookie":
        `${SESSION_NAME}=; ` +
        `Max-Age=0; ` +
        `Path=/; ` +
        `HttpOnly; ` +
        `Secure; ` +
        `SameSite=None`
    }
  );
}


// =====================================================
// SESSION
// =====================================================

async function getSession(request, env) {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies = parseCookies(cookieHeader);

  const token = cookies[SESSION_NAME];

  if (!token) {
    return null;
  }

  return await verifySignedSession(
    token,
    env.ADMIN_SECRET
  );
}


// =====================================================
// COOKIE PARSER
// =====================================================

function parseCookies(cookieHeader) {
  const cookies = {};

  const parts = cookieHeader.split(";");

  for (const part of parts) {
    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = part.substring(0, index).trim();
    const value = part.substring(index + 1).trim();

    cookies[key] = value;
  }

  return cookies;
}


// =====================================================
// CREATE SIGNED SESSION
// =====================================================

async function createSignedSession(data, secret) {
  const payload = base64UrlEncode(
    JSON.stringify(data)
  );

  const signature = await signHMAC(
    payload,
    secret
  );

  return `${payload}.${signature}`;
}


// =====================================================
// VERIFY SIGNED SESSION
// =====================================================

async function verifySignedSession(token, secret) {
  try {
    const parts = token.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const payload = parts[0];
    const signature = parts[1];

    const expectedSignature = await signHMAC(
      payload,
      secret
    );

    if (!timingSafeEqual(signature, expectedSignature)) {
      return null;
    }

    const data = JSON.parse(
      base64UrlDecode(payload)
    );

    if (!data.expiresAt) {
      return null;
    }

    if (Date.now() > data.expiresAt) {
      return null;
    }

    return data;

  } catch (error) {
    return null;
  }
}


// =====================================================
// HMAC SHA-256
// =====================================================

async function signHMAC(message, secret) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );

  return arrayBufferToBase64Url(signature);
}


// =====================================================
// TIMING SAFE COMPARE
// =====================================================

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}


// =====================================================
// GET DICTIONARY
// =====================================================

async function getDictionary(env, origin, allowedOrigin) {
  const result = await getGitHubFile(env);

  return jsonResponse(
    {
      success: true,
      dictionary: result.data,
      sha: result.sha
    },
    200,
    origin,
    allowedOrigin
  );
}


// =====================================================
// ADD WORD
// =====================================================

async function addWord(request, env, origin, allowedOrigin) {
  const body = await request.json();

  const wordData = body.word || body;

  if (!wordData.word) {
    return jsonResponse(
      {
        success: false,
        message: "กรุณากรอกคำศัพท์"
      },
      400,
      origin,
      allowedOrigin
    );
  }

  const result = await getGitHubFile(env);

  const dictionary = result.data;

  const newWord = normalizeWord(wordData);

  // ตรวจ ID ซ้ำ
  if (
    dictionary.some(
      item => item.id === newWord.id
    )
  ) {
    return jsonResponse(
      {
        success: false,
        message: "ID นี้มีอยู่แล้ว"
      },
      409,
      origin,
      allowedOrigin
    );
  }

  // ตรวจคำศัพท์ซ้ำ
  if (
    dictionary.some(
      item => item.word === newWord.word
    )
  ) {
    return jsonResponse(
      {
        success: false,
        message: "คำศัพท์นี้มีอยู่แล้ว"
      },
      409,
      origin,
      allowedOrigin
    );
  }

  dictionary.push(newWord);

  const updated = await updateGitHubFile(
    env,
    dictionary,
    result.sha,
    `Add word: ${newWord.word}`
  );

  return jsonResponse(
    {
      success: true,
      message: "เพิ่มคำศัพท์สำเร็จ",
      word: newWord,
      sha: updated.content?.sha || null
    },
    200,
    origin,
    allowedOrigin
  );
}


// =====================================================
// UPDATE WORD
// =====================================================

async function updateWord(request, env, origin, allowedOrigin) {
  const body = await request.json();

  const id = body.id;
  const wordData = body.word || body.data;

  if (!id) {
    return jsonResponse(
      {
        success: false,
        message: "ไม่พบ ID ของคำศัพท์"
      },
      400,
      origin,
      allowedOrigin
    );
  }

  if (!wordData || !wordData.word) {
    return jsonResponse(
      {
        success: false,
        message: "ข้อมูลคำศัพท์ไม่ครบ"
      },
      400,
      origin,
      allowedOrigin
    );
  }

  const result = await getGitHubFile(env);

  const dictionary = result.data;

  const index = dictionary.findIndex(
    item => item.id === id
  );

  if (index === -1) {
    return jsonResponse(
      {
        success: false,
        message: "ไม่พบคำศัพท์ที่ต้องการแก้ไข"
      },
      404,
      origin,
      allowedOrigin
    );
  }

  const updatedWord = normalizeWord(
    wordData,
    id
  );

  // ตรวจคำศัพท์ซ้ำกับรายการอื่น
  const duplicateWord = dictionary.some(
    (item, i) =>
      i !== index &&
      item.word === updatedWord.word
  );

  if (duplicateWord) {
    return jsonResponse(
      {
        success: false,
        message: "คำศัพท์นี้มีอยู่แล้ว"
      },
      409,
      origin,
      allowedOrigin
    );
  }

  dictionary[index] = updatedWord;

  const updated = await updateGitHubFile(
    env,
    dictionary,
    result.sha,
    `Update word: ${updatedWord.word}`
  );

  return jsonResponse(
    {
      success: true,
      message: "แก้ไขคำศัพท์สำเร็จ",
      word: updatedWord,
      sha: updated.content?.sha || null
    },
    200,
    origin,
    allowedOrigin
  );
}


// =====================================================
// DELETE WORD
// =====================================================

async function deleteWord(request, env, origin, allowedOrigin) {
  const url = new URL(request.url);

  const id = url.searchParams.get("id");

  if (!id) {
    return jsonResponse(
      {
        success: false,
        message: "กรุณาระบุ ID"
      },
      400,
      origin,
      allowedOrigin
    );
  }

  const result = await getGitHubFile(env);

  const dictionary = result.data;

  const index = dictionary.findIndex(
    item => item.id === id
  );

  if (index === -1) {
    return jsonResponse(
      {
        success: false,
        message: "ไม่พบคำศัพท์ที่ต้องการลบ"
      },
      404,
      origin,
      allowedOrigin
    );
  }

  const deletedWord = dictionary[index];

  dictionary.splice(index, 1);

  const updated = await updateGitHubFile(
    env,
    dictionary,
    result.sha,
    `Delete word: ${deletedWord.word}`
  );

  return jsonResponse(
    {
      success: true,
      message: "ลบคำศัพท์สำเร็จ",
      deleted: deletedWord,
      sha: updated.content?.sha || null
    },
    200,
    origin,
    allowedOrigin
  );
}


// =====================================================
// NORMALIZE WORD
// =====================================================

function normalizeWord(data, forcedId = null) {
  const word = String(data.word || "").trim();

  const pinyin = String(
    data.pinyin || ""
  ).trim();

  const thaiPronunciation = String(
    data.thaiPronunciation || ""
  ).trim();

  let meanings = data.meanings || [];

  if (typeof meanings === "string") {
    meanings = meanings
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  }

  let partOfSpeech = data.partOfSpeech || [];

  if (typeof partOfSpeech === "string") {
    partOfSpeech = partOfSpeech
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  }

  let hsk = data.hsk || [];

  if (!Array.isArray(hsk)) {
    hsk = [hsk];
  }

  hsk = hsk
    .map(Number)
    .filter(
      n => Number.isInteger(n) && n >= 1 && n <= 6
    );

  let examples = data.examples || [];

  if (!Array.isArray(examples)) {
    examples = [];
  }

  examples = examples.map(example => ({
    chinese: String(
      example.chinese || ""
    ).trim(),

    pinyin: String(
      example.pinyin || ""
    ).trim(),

    thai: String(
      example.thai || ""
    ).trim()
  }));

  return {
    id:
      forcedId ||
      String(data.id || createId(word, pinyin)),

    word,

    pinyin,

    thaiPronunciation,

    meanings,

    partOfSpeech,

    hsk,

    examples
  };
}


// =====================================================
// CREATE ID
// =====================================================

function createId(word, pinyin = "") {
  const source = pinyin || word;

  let id = source
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");

  if (!id) {
    id =
      "word-" +
      Date.now().toString(36);
  }

  return id;
}


// =====================================================
// GITHUB API
// =====================================================

function githubURL(env) {
  return (
    `https://api.github.com/repos/` +
    `${env.GITHUB_OWNER}/` +
    `${env.GITHUB_REPO}/contents/` +
    `${env.GITHUB_FILE}`
  );
}


// =====================================================
// GET FILE FROM GITHUB
// =====================================================

async function getGitHubFile(env) {
  const response = await fetch(
    githubURL(env),
    {
      method: "GET",

      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Mini-Dicto-Worker"
      }
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `GitHub GET error ${response.status}: ${errorText}`
    );
  }

  const result = await response.json();

  const content = decodeBase64UTF8(
    result.content
  );

  let data;

  try {
    data = JSON.parse(content);
  } catch (error) {
    throw new Error(
      "dictionary.json ไม่ใช่ JSON ที่ถูกต้อง"
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "dictionary.json ต้องเป็น Array"
    );
  }

  return {
    data,
    sha: result.sha
  };
}


// =====================================================
// UPDATE FILE ON GITHUB
// =====================================================

async function updateGitHubFile(
  env,
  dictionary,
  sha,
  message
) {
  const content = JSON.stringify(
    dictionary,
    null,
    2
  );

  const encoded = encodeBase64UTF8(
    content
  );

  const response = await fetch(
    githubURL(env),
    {
      method: "PUT",

      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "Mini-Dicto-Worker"
      },

      body: JSON.stringify({
        message,
        content: encoded,
        sha
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `GitHub PUT error ${response.status}: ${errorText}`
    );
  }

  return await response.json();
}


// =====================================================
// UTF-8 BASE64 ENCODE
// =====================================================

function encodeBase64UTF8(text) {
  const bytes = new TextEncoder().encode(text);

  let binary = "";

  const chunkSize = 0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    const chunk = bytes.subarray(
      i,
      i + chunkSize
    );

    binary += String.fromCharCode(
      ...chunk
    );
  }

  return btoa(binary);
}


// =====================================================
// UTF-8 BASE64 DECODE
// =====================================================

function decodeBase64UTF8(base64) {
  const binary = atob(
    base64.replace(/\n/g, "")
  );

  const bytes = new Uint8Array(
    binary.length
  );

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new TextDecoder().decode(bytes);
}


// =====================================================
// BASE64 URL ENCODE
// =====================================================

function base64UrlEncode(text) {
  const bytes = new TextEncoder().encode(text);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}


// =====================================================
// BASE64 URL DECODE
// =====================================================

function base64UrlDecode(base64) {
  let value = base64
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (value.length % 4) {
    value += "=";
  }

  const binary = atob(value);

  const bytes = new Uint8Array(
    binary.length
  );

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new TextDecoder().decode(bytes);
}
