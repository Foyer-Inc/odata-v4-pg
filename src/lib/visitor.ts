import { Token } from "odata-v4-parser/lib/lexer";
import { Literal } from "odata-v4-literal";
import { SQLLiteral, SQLLang, Visitor } from "odata-v4-sql/lib/visitor";
import { SqlOptions } from "./index";

export const ODATA_TYPE = '@odata.type';
export const ODATA_TYPENAME = '@odata.type.name';

export class PGVisitor extends Visitor{
	parameters:any[] = [];
	includes:PGVisitor[] = [];
	join: string;

	constructor(options = <SqlOptions>{}){
		super(options);
		(<any>this).parameters = [];
		this.type = SQLLang.PostgreSql;
	}

	from(table:string){
		let sql = `SELECT ${this.select} FROM "${table}"`;

		if (this.join) {
			sql += ` ${this.join} `;
			sql = sql.replace(/placeholderTable/g, table);
		} else if (this.where) {
			sql += ` WHERE ${this.where} `;
		}

		if (this.orderby) {
			sql += ` ORDER BY ${this.orderby}`;
		}

		if (typeof this.limit == "number") sql += ` LIMIT ${this.limit}`;
		if (typeof this.skip == "number") sql += ` OFFSET ${this.skip}`;
		return sql;
	}

	protected VisitExpand(node: Token, context: any) {
		node.value.items.forEach((item) => {
			let expandPath = item.value.path.raw;
			let visitor = this.includes.filter(v => v.navigationProperty == expandPath)[0];
			if (!visitor){
				visitor = new PGVisitor(this.options);
				visitor.parameterSeed = this.parameterSeed;
				this.includes.push(visitor);
			}
			visitor.Visit(item);
			this.parameterSeed = visitor.parameterSeed;
		});
	}

	protected VisitEnum(node: Token, context: any) {
		const enumName = node.value.name.raw.split('.');
		context.enumName = enumName.pop();
		context.enumNamespace = enumName.join('.');
		this.Visit(node.value.value, context);
	}

	protected VisitEnumValue(node: Token, context: any) {
		this.Visit(node.value.values[0], context);
	}

	protected VisitEnumerationMember(node: Token, context: any) {
		this.Visit(node.value, context)
	}

	protected VisitEnumMemberValue(node: Token, context: any) {
		if (this.options.useParameters){
			let value = node[ODATA_TYPE][SQLLiteral.convert(node.value, node.raw)]
			context.literal = value;
			if (context.literal != null){
				this.parameters.push(value);
			}
			this.where += `\$${this.parameters.length}`;
		}else this.where += (context.literal = SQLLiteral.convert(node.value, node.raw));
	}

	protected VisitSelectItem(node:Token, context:any){
		let item = node.raw.replace(/\//g, '.');
		this.select += `"${item}"`;
	}

	protected VisitODataIdentifier(node:Token, context:any){
		this[context.target] += `"${node.value.name}"`;
		context.identifier = node.value.name;
	}

	protected VisitEqualsExpression(node:Token, context:any){
		this.Visit(node.value.left, context);
		this.where += " = ";
		this.Visit(node.value.right, context);
		if (context.literal == null){
			this.where = this.where.replace(new RegExp(`"${context.identifier}" = \\$\\d+`), `"${context.identifier}" IS NULL`);
		}
	}

	protected VisitHasExpression(node:Token, context:any){
		this.Visit(node.value.left, context);
		this.where += " @> ARRAY[";
		this.Visit(node.value.right, context);
		this.where += "]";
		if (context.literal == null){
			this.where = this.where.replace(new RegExp(`"${context.identifier}" @> \\$\\d+`), `"${context.identifier}" IS NULL`);
		}
	}

	protected VisitLambdaVariableExpression(node: Token, context: any) { }

	protected VisitLambdaPredicateExpression(node: Token, context: any) {
		const enumValue = node.value?.value?.right?.value?.value?.raw;

		if (enumValue) {
			this.parameters.push(enumValue);
			const columnName = context.identifier.replace(".", "");

			this.join = `LEFT JOIN "${columnName}Map" ON "${columnName}Map"."placeholderTableKey" = "placeholderTable"."ListingKey" WHERE "${columnName}Map"."Value"=$${this.parameters.length}`;
		}
	}

	protected VisitAnyExpression(node: Token, context: any) {
		this.Visit(node.value.predicate, context);
	}

	protected VisitAllExpression(node: Token, context: any) {
		this.Visit(node.value.predicate, context);
	}

	protected VisitCollectionPathExpression(node: Token, context: any) {
		this.Visit(node.value, context);
	}

	protected VisitNotEqualsExpression(node:Token, context:any){
		this.Visit(node.value.left, context);
		this.where += " <> ";
		this.Visit(node.value.right, context);
		if (context.literal == null){
			this.where = this.where.replace(new RegExp(`"${context.identifier}" <> \\$\\d+`), `"${context.identifier}" IS NOT NULL`);
		}
	}

	protected VisitLiteral(node:Token, context:any){
		if (this.options.useParameters){
			let value = Literal.convert(node.value, node.raw);
			context.literal = value;
			if (context.literal != null){
				this.parameters.push(value);
			}
			this.where += `\$${this.parameters.length}`;
		}else this.where += (context.literal = SQLLiteral.convert(node.value, node.raw));
	}

	protected VisitMethodCallExpression(node:Token, context:any){
		var method = node.value.method;
		var params = node.value.parameters || [];
		switch (method){
			case "contains":
				this.Visit(params[0], context);
				if (this.options.useParameters){
					let value = Literal.convert(params[1].value, params[1].raw);
					this.parameters.push(`%${value}%`);
					this.where += ` ilike \$${this.parameters.length}`;
				}else this.where += ` ilike '%${SQLLiteral.convert(params[1].value, params[1].raw).slice(1, -1)}%'`;
				break;
			case "endswith":
				this.Visit(params[0], context);
				if (this.options.useParameters){
					let value = Literal.convert(params[1].value, params[1].raw);
					this.parameters.push(`%${value}`);
					this.where += ` ilike \$${this.parameters.length}`;
				}else this.where += ` ilike '%${SQLLiteral.convert(params[1].value, params[1].raw).slice(1, -1)}'`;
				break;
			case "startswith":
				this.Visit(params[0], context);
				if (this.options.useParameters){
					let value = Literal.convert(params[1].value, params[1].raw);
					this.parameters.push(`${value}%`);
					this.where += ` ilike \$${this.parameters.length}`;
				}else this.where += ` ilike '${SQLLiteral.convert(params[1].value, params[1].raw).slice(1, -1)}%'`;
				break;
			case "substring":
				this.where += "SUBSTR(";
				this.Visit(params[0], context);
				this.where += ", ";
				this.Visit(params[1], context);
				this.where += " + 1";
				if (params[2]){
					this.where += ", ";
					this.Visit(params[2], context);
				}else{
					this.where += ", CHAR_LENGTH(";
					this.Visit(params[0], context);
					this.where += ")";
				}
				this.where += ")";
				break;
			case "substringof":
				this.Visit(params[1], context);
				if (params[0].value == "Edm.String"){
					if (this.options.useParameters){
						let value = Literal.convert(params[0].value, params[0].raw);
						this.parameters.push(`%${value}%`);
						this.where += ` ilike \$${this.parameters.length}`;
					}else this.where += ` ilike '%${SQLLiteral.convert(params[0].value, params[0].raw).slice(1, -1)}%'`;
				}else{
					this.where += " ilike ";
					this.Visit(params[0], context);
				}
				break;
			case "concat":
				this.where += "(COALESCE(";
				this.Visit(params[0], context);
				this.where += ", '') || COALESCE(";
				this.Visit(params[1], context);
				this.where += ", ''))";
				break;
			case "round":
				this.where += "ROUND(";
				this.Visit(params[0], context);
				this.where += ")";
				break;
			case "length":
				this.where += "CHAR_LENGTH(";
				this.Visit(params[0], context);
				this.where += ")";
				break;
			case "tolower":
				this.where += "LCASE(";
				this.Visit(params[0], context);
				this.where += ")";
				break;
			case "toupper":
				this.where += "UCASE(";
				this.Visit(params[0], context);
				this.where += ")";
				break;
			case "floor":
			case "ceiling":
			case "year":
			case "month":
			case "day":
			case "hour":
			case "minute":
			case "second":
				this.where += `${method.toUpperCase()}(`;
				this.Visit(params[0], context);
				this.where += ")";
				break;
			case "now":
				this.where += "NOW()";
				break;
			case "trim":
				this.where += "TRIM(BOTH ' ' FROM ";
				this.Visit(params[0], context);
				this.where += ")";
				break;
		}
	}

}
