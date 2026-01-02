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
            const passwordHash = await bcrypt.hash('adminadmin', 12);
            await User.create({
                firstName: 'admin',
                lastName: 'admin',
                email: 'admin@gmail.com',
                password: passwordHash,
                role: 'admin',
            });
            console.log('Default admin user created');
        }
    } catch (error) {
        console.error("Error creating default admin:", error);
    }
};

const connectDB = async () => {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const connectionUri =
            process.env.MONGO_URI ||
            process.env.MONGODB_URI ||
            'mongodb://127.0.0.1:27017';

        const connectionOptions: mongoose.ConnectOptions = {
            bufferCommands: false, // Don't buffer commands if not connected, fail fast
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
