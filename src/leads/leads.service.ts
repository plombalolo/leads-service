import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from '../dto/create-lead.dto';
import { UpdateLeadDto } from '../dto/update-lead.dto';
import { FindLeadsDto } from '../dto/find-leads.dto';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async create(createLeadDto: CreateLeadDto) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingLead = await this.prisma.lead.findFirst({
      where: {
        email: createLeadDto.email,
        createdAt: { gte: twentyFourHoursAgo },
      },
    });

    if (existingLead) {
      throw new BadRequestException(
        'Заявка з таким email вже була створена протягом останніх 24 годин.',
      );
    }

    const status = createLeadDto.budget >= 10000 ? 'priority' : 'new';

    const lead = await this.prisma.lead.create({
      data: {
        ...createLeadDto,
        status,
      },
    });

    if (status === 'priority') {
      const webhookUrl =
        process.env.WEBHOOK_URL || 'https://webhook.site/your-unique-test-url';
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
      }).catch((error: any) => {
        console.error('Не вдалося надіслати вебхук:', error.message);
      });
    }

    return lead;
  }

  async findAll(query: FindLeadsDto) {
    const {
      search,
      status,
      country,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    return this.prisma.lead.findMany({
      where: {
        AND: [
          search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {},
          status ? { status } : {},
          country ? { country } : {},
        ],
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
    });
  }

  async findOne(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException(`Лід з ID ${id} не знайдено`);
    }
    return lead;
  }

  async update(id: string, updateLeadDto: UpdateLeadDto) {
    await this.findOne(id); // гарантує 404, якщо такого ID немає
    return this.prisma.lead.update({
      where: { id },
      data: updateLeadDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.lead.delete({
      where: { id },
    });
  }
}
