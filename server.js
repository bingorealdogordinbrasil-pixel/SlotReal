const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("✅ BANCO CONECTADO"));

const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true },
    pass: String,
    fone: String,
    saldo: { type: Number, default: 0.00 }
}));

// ROTA DE LOGIN - ADICIONEI O RESET DE SALDO AQUI
app.post('/auth/login', async (req, res) => {
    const { user, pass } = req.body;
    // Procuro o usuário
    const conta = await User.findOne({ user, pass });
    
    if (conta) {
        // SE O SALDO FOR MAIOR QUE 0 E ELE NÃO DEPOSITOU, ZERAMOS AQUI (OPCIONAL)
        // Se quiser que comece zerado SEMPRE agora, use a linha abaixo:
        // await User.findOneAndUpdate({ user }, { saldo: 0.00 }); 
        
        res.json({ success: true, saldo: conta.saldo });
    } else {
        res.json({ success: false, message: "Dados incorretos" });
    }
});

app.post('/auth/cadastro', async (req, res) => {
    try {
        const novo = new User({ 
            user: req.body.user, 
            pass: req.body.pass, 
            fone: req.body.fone, 
            saldo: 0.00 // GARANTE ZERO NO NOVO USER
        });
        await novo.save();
        res.json({ success: true, saldo: 0.00 });
    } catch (e) { res.json({ success: false, message: "Usuário já existe" }); }
});

// O RESTO DO CÓDIGO (SPIN, PIX, SAQUE) SEGUE IGUAL...
app.post('/api/spin', async (req, res) => {
    const { user, bets } = req.body;
    const userDb = await User.findOne({ user });
    if (!userDb || userDb.saldo <= 0) return res.json({ success: false, message: "Sem saldo" });
    // ... lógica do spin ...
});

app.listen(10000, () => console.log("🚀 SISTEMA ZERADO E RODANDO"));
