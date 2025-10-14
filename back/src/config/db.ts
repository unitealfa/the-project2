import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../users/user.model';

const DEFAULT_DB_NAME = 'e-com';

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
};

const connectDB = async () => {
    try {
        const connectionUri =
            process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';

        const connectionOptions: mongoose.ConnectOptions = {};

        if (shouldUseDefaultDatabase(process.env.MONGO_URI)) {
            connectionOptions.dbName = DEFAULT_DB_NAME;
        }

        await mongoose.connect(connectionUri, connectionOptions);
        console.log('MongoDB connected');
        await ensureAdminExists();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

export default connectDB;