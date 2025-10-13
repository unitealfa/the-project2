import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../users/user.model';

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
        await mongoose.connect(process.env.MONGO_URI || '');
        console.log('MongoDB connected');
        await ensureAdminExists();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

export default connectDB;