import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../users/user.model';

const DEFAULT_DB_NAME = 'e-com';

// Define the cached interface
interface MongooseCache {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
}

// Add strict typing for global
declare global {
    var mongoose: MongooseCache;
}

let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

const shouldUseDefaultDatabase = (uri?: string) => {
    if (!uri) {
        return true;
    }

    const [uriWithoutOptions] = uri.split('?');
    const withoutProtocol = uriWithoutOptions.replace(/^mongodb(\+srv)?:\/\//, '');
    const slashIndex = withoutProtocol.indexOf('/');

    if (slashIndex === -1) {
        return true;
    }

    const databasePath = withoutProtocol.slice(slashIndex + 1);

    return databasePath.length === 0;
};

const ensureAdminExists = async () => {
    try {
        const adminExists = await User.exists({ role: 'admin' });
        if (!adminExists) {
            const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
            const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
            if (
                !email ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
                email.length > 254 ||
                !password ||
                password.length < 12 ||
                password.length > 128
            ) {
                console.warn(
                    'Aucun administrateur: configurez BOOTSTRAP_ADMIN_EMAIL et un BOOTSTRAP_ADMIN_PASSWORD de 12 caracteres minimum.'
                );
                return;
            }
            const passwordHash = await bcrypt.hash(password, 12);
            await User.create({
                firstName: 'admin',
                lastName: 'admin',
                email,
                password: passwordHash,
                role: 'admin',
            });
            console.log('Compte administrateur initial créé');
        }
    } catch (error) {
        console.error('Création du compte administrateur initial impossible');
    }
};

const connectDB = async () => {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const configuredUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!configuredUri && process.env.NODE_ENV === 'production') {
            throw new Error('MONGO_URI doit être configuré en production');
        }
        const connectionUri = configuredUri || 'mongodb://127.0.0.1:27017';

        const configuredTimeout = Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS);
        const serverSelectionTimeoutMS = Number.isFinite(configuredTimeout)
            ? Math.min(Math.max(configuredTimeout, 1_000), 60_000)
            : 10_000;

        const connectionOptions: mongoose.ConnectOptions = {
            bufferCommands: false, // Don't buffer commands if not connected, fail fast
            serverSelectionTimeoutMS,
        };

        if (shouldUseDefaultDatabase(connectionUri)) {
            connectionOptions.dbName = DEFAULT_DB_NAME;
        }

        cached.promise = mongoose.connect(connectionUri, connectionOptions).then(async (mongoose) => {
            console.log('MongoDB connected');
            await ensureAdminExists();
            return mongoose;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null; // Reset promise on failure so we can retry
        throw e;
    }

    return cached.conn;
};

export default connectDB;
