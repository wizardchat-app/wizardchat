package org.wizardchat.core

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import kotlinx.serialization.serializer
import uniffi.wizardchat_core_ffi.Core
import uniffi.wizardchat_core_ffi.CoreException
import uniffi.wizardchat_core_ffi.EventSink

/** How the generated API reads and writes the core's JSON */
val CoreJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}

/** Loads the core; call once from `Application.onCreate`, before any network request */
object CoreInit {
    private var loaded = false

    @Synchronized
    fun load(context: Context) {
        if (loaded) return
        System.loadLibrary("wizardchat_core_ffi")
        init(context.applicationContext)
        loaded = true
    }

    @JvmStatic
    private external fun init(context: Context)
}

/** A failed call: the core's `{ code, message, errcode? }` */
class WizardError(val code: String, override val message: String, val errcode: String? = null) :
    Exception(message) {
    companion object {
        fun from(json: String): WizardError {
            val body = runCatching { CoreJson.parseToJsonElement(json).jsonObject }.getOrNull()
            return WizardError(
                code = body?.get("code")?.jsonPrimitive?.content ?: "sdk",
                message = body?.get("message")?.jsonPrimitive?.content ?: json,
                errcode = (body?.get("errcode") as? JsonPrimitive)?.takeIf { it.isString }?.content,
            )
        }
    }
}

sealed interface Arg {
    class Value(val encode: () -> JsonElement) : Arg
    class Bytes(val data: ByteArray) : Arg
    class Listener(val id: Long) : Arg

    companion object {
        inline fun <reified T> value(value: T): Arg = Value { CoreJson.encodeToJsonElement(coreSerializer<T>(), value) }

        fun bytes(data: ByteArray): Arg = Bytes(data)

        inline fun <reified T> listener(noinline handler: (T) -> Unit): Arg =
            Listener(Runtime.register(coreSerializer<T>(), handler))
    }
}

/** Blobs of the call being encoded or the reply being decoded; `Bytes` values refer to them by index */
internal object Blobs {
    val current = ThreadLocal<MutableList<ByteArray>>()

    inline fun <T> with(blobs: MutableList<ByteArray>, block: () -> T): T {
        val previous = current.get()
        current.set(blobs)
        try {
            return block()
        } finally {
            current.set(previous)
        }
    }
}

object BytesSerializer : KSerializer<ByteArray> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("Bytes")

    override fun deserialize(decoder: Decoder): ByteArray {
        val json = (decoder as JsonDecoder).decodeJsonElement()
        val index = json.jsonObject["\$bytes"]?.jsonPrimitive?.long?.toInt()
            ?: throw SerializationException("not bytes: $json")
        return Blobs.current.get()?.getOrNull(index) ?: throw SerializationException("no blob $index")
    }

    override fun serialize(encoder: Encoder, value: ByteArray) {
        val blobs = Blobs.current.get() ?: throw SerializationException("bytes outside a call")
        blobs.add(value)
        (encoder as JsonEncoder).encodeJsonElement(buildJsonObject { put("\$bytes", blobs.size - 1) })
    }
}

typealias Bytes = @kotlinx.serialization.Serializable(with = BytesSerializer::class) ByteArray

/** `serializer<T>()`, except that `Bytes` keeps its blob encoding: a typealias's serializer is lost in a type parameter */
@Suppress("UNCHECKED_CAST")
inline fun <reified T> coreSerializer(): KSerializer<T> = when {
    T::class != ByteArray::class -> serializer<T>()
    null is T -> BytesSerializer.nullable as KSerializer<T>
    else -> BytesSerializer as KSerializer<T>
}

/** `()`: encodes as null, reads anything */
@kotlinx.serialization.Serializable(with = EmptySerializer::class)
object Empty

object EmptySerializer : KSerializer<Empty> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("Empty")
    override fun deserialize(decoder: Decoder): Empty {
        (decoder as JsonDecoder).decodeJsonElement()
        return Empty
    }

    override fun serialize(encoder: Encoder, value: Empty) {
        (encoder as JsonEncoder).encodeJsonElement(JsonNull)
    }
}

/** A union read and written through its JSON (the generated sealed interfaces) */
abstract class JsonUnionSerializer<T>(name: String) : KSerializer<T> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor(name)
    abstract fun read(json: JsonElement): T
    abstract fun write(value: T): JsonElement

    override fun deserialize(decoder: Decoder): T = read((decoder as JsonDecoder).decodeJsonElement())

    override fun serialize(encoder: Encoder, value: T) {
        (encoder as JsonEncoder).encodeJsonElement(write(value))
    }

    protected fun tagged(payload: JsonElement, tag: String, value: String): JsonElement =
        JsonObject(payload.jsonObject + (tag to JsonPrimitive(value)))
}

object Runtime {
    private const val TAG = "wizardchat-core"
    private val listeners = ConcurrentHashMap<Long, (String) -> Unit>()
    private val nextListener = AtomicLong(1)
    private val main = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val core: Core by lazy {
        Core(object : EventSink {
            override fun event(listener: ULong, json: String) = deliver(listener.toLong(), json)
        })
    }

    /** An async method; callbacks passed to it only live as long as the call */
    suspend inline fun <reified R> call(method: String, handle: Long?, args: List<Arg>): R =
        call(method, handle, args, coreSerializer<R>())

    suspend fun <R> call(method: String, handle: Long?, args: List<Arg>, type: KSerializer<R>): R {
        try {
            val (json, blobs) = send(method, handle, args)
            return decode(type, json, blobs)
        } finally {
            listenerIds(args).forEach(::forget)
        }
    }

    suspend fun callUnit(method: String, handle: Long?, args: List<Arg>) {
        try {
            send(method, handle, args)
        } finally {
            listenerIds(args).forEach(::forget)
        }
    }

    fun <S : Subscription> watch(method: String, handle: Long, args: List<Arg>, make: (Long) -> S): S {
        val id = listenerIds(args).firstOrNull() ?: 0
        scope.launch {
            try {
                send(method, handle, args)
            } catch (error: Exception) {
                forget(id)
                Log.w(TAG, "$method failed", error)
            }
        }
        return make(id)
    }

    private suspend fun send(method: String, handle: Long?, args: List<Arg>): Pair<String, List<ByteArray>> {
        val blobs = mutableListOf<ByteArray>()
        val json = Blobs.with(blobs) {
            JsonArray(
                args.map { arg ->
                    when (arg) {
                        is Arg.Value -> arg.encode()
                        is Arg.Bytes -> {
                            blobs.add(arg.data)
                            buildJsonObject { put("\$bytes", blobs.size - 1) }
                        }
                        is Arg.Listener -> JsonPrimitive(arg.id)
                    }
                },
            ).toString()
        }
        try {
            val reply = core.call(method, handle?.toULong(), json, blobs)
            return reply.json to reply.blobs
        } catch (error: CoreException.Call) {
            throw WizardError.from(error.json)
        }
    }

    private fun listenerIds(args: List<Arg>) = args.filterIsInstance<Arg.Listener>().map { it.id }

    fun <T> decode(type: KSerializer<T>, json: String, blobs: List<ByteArray>): T =
        Blobs.with(blobs.toMutableList()) { CoreJson.decodeFromString(type, json) }

    internal fun release(handle: Long) = core.release(handle.toULong())

    internal fun cancel(listener: Long) {
        forget(listener)
        core.cancel(listener.toULong())
    }

    /** Drops every object and listener, e.g. after signing out of all accounts */
    fun reset() {
        listeners.clear()
        core.reset()
    }

    fun <T> register(type: KSerializer<T>, handler: (T) -> Unit): Long {
        val id = nextListener.getAndIncrement()
        listeners[id] = { json ->
            try {
                handler(decode(type, json, emptyList()))
            } catch (error: SerializationException) {
                Log.w(TAG, "listener $id got ${type.descriptor.serialName} it can't read", error)
            }
        }
        return id
    }

    private fun forget(id: Long) {
        listeners.remove(id)
    }

    private fun deliver(listener: Long, json: String) {
        val handler = listeners[listener] ?: return
        main.post { handler(json) }
    }
}

/** An object living in the core, e.g. a client or a room; released when collected */
abstract class Remote(val handle: Long, props: JsonObject) {
    var props: JsonObject = props
        internal set

    inline fun <reified T> prop(name: String): T =
        CoreJson.decodeFromJsonElement(props[name] ?: JsonNull)

    @Suppress("removal", "DEPRECATION")
    protected fun finalize() {
        Runtime.release(handle)
    }

    override fun equals(other: Any?) = other is Remote && other.handle == handle
    override fun hashCode() = handle.hashCode()
}

open class RemoteSerializer<T : Remote>(private val className: String, private val make: (Long, JsonObject) -> T) :
    KSerializer<T> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor(className)

    override fun deserialize(decoder: Decoder): T {
        val json = (decoder as JsonDecoder).decodeJsonElement().jsonObject
        val handle = json["\$handle"]?.jsonPrimitive?.long ?: throw SerializationException("no handle in $json")
        val remote = make(handle, json["props"] as? JsonObject ?: JsonObject(emptyMap()))
        if (className == "WizardClient") followSession(remote)
        return remote
    }

    override fun serialize(encoder: Encoder, value: T) {
        (encoder as JsonEncoder).encodeJsonElement(buildJsonObject { put("\$handle", value.handle) })
    }

    /** Refreshed tokens arrive as events; keep `session` current for saving */
    private fun followSession(remote: Remote) {
        val ref = java.lang.ref.WeakReference(remote)
        Runtime.watch(
            "WizardClient.watchSession",
            remote.handle,
            listOf(
                Arg.listener<JsonElement> { event ->
                    val target = ref.get() ?: return@listener
                    val body = event as? JsonObject ?: return@listener
                    val session = body["session"]
                    if ((body["type"] as? JsonPrimitive)?.content == "refreshed" && session != null) {
                        target.props = JsonObject(target.props + ("session" to session))
                    }
                },
            ),
            ::Subscription,
        )
    }
}

/** A running stream from the core; `cancel` stops it */
open class Subscription(val listener: Long) {
    private var cancelled = false

    fun cancel() {
        if (cancelled || listener == 0L) return
        cancelled = true
        Runtime.cancel(listener)
    }
}

class RoomListSubscription(listener: Long) : Subscription(listener) {
    fun setFilter(filter: RoomFilter) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                Runtime.callUnit(
                    "RoomListSubscription.setFilter",
                    null,
                    listOf(Arg.value(listener), Arg.value(filter)),
                )
            } catch (error: Exception) {
                Log.w("wizardchat-core", "setFilter failed", error)
            }
        }
    }
}

/** Reads the JSON a generated `JsonElement` field holds */
inline fun <reified T> JsonElement.decode(): T = CoreJson.decodeFromJsonElement(this)
